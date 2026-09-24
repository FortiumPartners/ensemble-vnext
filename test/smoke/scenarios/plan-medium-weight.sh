#!/usr/bin/env bash
# =============================================================================
# plan-medium-weight — a real /plan run that sizes itself to medium
# =============================================================================
#
# WHY THIS EXISTS
#
# plan-light-fix and plan-decoy-root-cause prove /plan does not OVER-escalate
# a one-file defect. Neither exercises the other end: a subject genuinely
# large enough to earn `weight: medium` — full authoring, grounding, AND an
# audit-trd pass (AC-F2.5, NG11) — the way any other feature gets them.
#
# /plan takes NO `--weight` override (TNG3, TRD lines 782/798 — weight is
# always decided by the command from its own investigation), so this fixture
# cannot force the outcome. It can only supply a subject that reliably sizes
# itself to medium: a settled, mechanical body of work spanning many files
# with one obvious approach and no open product decision — the exact shape
# plan.md's own weight table (Step 4) describes as "a dozen or more [tasks]
# is typical". That is real model judgment, same class of flakiness the two
# existing /plan scenarios already accept, which is why this belongs in the
# opt-in roster rather than the default set.
#
# The fixture: 14 route handler files that all return errors as a bare
# string instead of the project's structured `{ error: { message, code } }`
# shape. Same fix, one handler at a time, nothing to decide — a change, not
# a defect, with no root cause to demonstrate.
#
# Asserts on the ARTIFACT, not the transcript:
#   1. exit 0, and output ends with a COMMAND COMPLETE / COMMAND STUCK banner
#   2. a TRD exists at docs/TRD/*.md and PARSES with more than one phase
#      (trd-parser.js's Object.keys(phases).length > 1 — the deterministic
#      way to tell a phased/medium TRD from a light trivial/small one, per
#      D4)
#   3. audit-trd ran — a Workflow({name:"audit-trd"}) tool call appears in
#      the session log
#   4. the run's output contains EXACTLY ONE "COMMAND COMPLETE" banner line
#      (D9: the exit test is prose judgment, and medium's own chain — F6's
#      Workflow(create-trd) / Workflow(audit-trd) calls — emits no banner of
#      its own per D5, so /plan's own terminator must be the only one)
#
# No --implement: per D7, --implement is the only thing that starts work, so
# a scenario that omits it must not expect implementation, and medium without
# --implement is the cheapest way to reach the audit-trd stage.
#
# Skips (not fails) when the claude CLI is unavailable.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
# shellcheck disable=SC2034
REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"
# shellcheck source=../lib/project.sh
source "${SMOKE_DIR}/lib/project.sh"

command -v claude &>/dev/null || smoke_skip "claude CLI not found in PATH"
command -v jq     &>/dev/null || smoke_skip "jq not installed"
command -v node   &>/dev/null || smoke_skip "node not installed"

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-plan-medium.XXXXXX")"
cleanup() {
    if [[ "${SMOKE_KEEP:-0}" == "1" ]] || [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  [kept for diagnosis] $PROJECT_DIR" >&2
        return 0
    fi
    rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT INT TERM

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

# --------------------------------------------------------------------------
# The fixture. 14 route handlers, each catching an error and sending it back
# as a bare string. The ask is mechanical and identical across every file --
# no design decision, nothing to disambiguate -- but "a dozen or more" files
# is exactly the shape plan.md's Step 4 names as typically medium.
# --------------------------------------------------------------------------
mkdir -p "${PROJECT_DIR}/src/routes"
ROUTE_NAMES=(users orders payments inventory shipping returns coupons
             reviews sessions carts wishlists notifications addresses invoices)
for name in "${ROUTE_NAMES[@]}"; do
    cat > "${PROJECT_DIR}/src/routes/${name}.js" <<JS
'use strict';

/**
 * ${name} route handler.
 * BUG: errors are sent back as a bare string, not the project's structured
 * { error: { message, code } } shape every other part of the API expects.
 */
function handle${name^}(req, res) {
  try {
    res.status(200).json({ ok: true, resource: '${name}' });
  } catch (err) {
    res.status(500).send(err.message);
  }
}

module.exports = { handle${name^} };
JS
done

cat > "${PROJECT_DIR}/src/routes/README.md" <<'MD'
# Route handlers

Every handler in this directory must send errors as:

    { "error": { "message": "<string>", "code": "<string>" } }

Currently every handler sends `err.message` as a bare string instead. This is
the project's documented contract, not an open design question — see the
shape above.
MD

cat > "${PROJECT_DIR}/package.json" <<'JSON'
{
  "name": "smoke-plan-medium",
  "version": "1.0.0",
  "private": true,
  "scripts": { "test": "jest" },
  "devDependencies": { "jest": "^30.0.0" }
}
JSON

git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: 14 route handlers with a bare-string error shape" --no-verify
assert_pass_raw "fixture planted (14 route handlers, one settled mechanical fix)"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
PROMPT="/plan every handler in src/routes/ (14 files, see src/routes/README.md) sends errors as a bare string instead of the documented { error: { message, code } } shape — standardize all of them to the documented shape, one handler at a time, no other behavior change"

smoke_claude "$PROMPT" 1600 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?
assert_exit_code 0 "$RC" "claude --print exits 0"

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner"

# --- a phased TRD exists — the deterministic medium/light discriminator ----
TRD_FILE="$(find "${PROJECT_DIR}/docs/TRD" -maxdepth 1 -name '*.md' 2>/dev/null | head -1)"
if [[ -z "$TRD_FILE" ]]; then
    assert_fail_raw "wrote a TRD — docs/TRD/ is empty"
else
    assert_pass_raw "wrote a TRD (${TRD_FILE#"$PROJECT_DIR"/})"

    PHASE_COUNT="$(node -e '
        const { parseTrd } = require(process.argv[1]);
        const fs = require("fs");
        const md = fs.readFileSync(process.argv[2], "utf8");
        const result = parseTrd(md, { path: process.argv[2] });
        console.log(Object.keys(result.phases || {}).length);
    ' "${REPO_ROOT}/packages/core/lib/trd-parser.js" "$TRD_FILE" 2>/dev/null)"

    if [[ "${PHASE_COUNT:-0}" -gt 1 ]] 2>/dev/null; then
        assert_pass_raw "TRD parses with more than one phase (${PHASE_COUNT}) — sized medium, not light"
    else
        assert_fail_raw "TRD parses with more than one phase — got '${PHASE_COUNT:-<parse error>}', expected medium's phased shape"
    fi
fi

# --- audit-trd ran ----------------------------------------------------------
# Same two-tier pattern smoke_agent_invoked uses for implementer dispatch
# (project.sh, ~lines 230-270), extended for a Workflow whose .input carries
# a `name`, not an `agentType` — that is how /plan's Step 5b dispatches
# create-trd and audit-trd (plan.md: `Workflow({ name: "audit-trd", ... })`).
# `jq -e` reflects only the LAST value it emitted, so a per-record filter would report
# "audit-trd did not run" whenever ANY Workflow call follows the audit one (a create-trd
# retry, a later dispatch). Slurp the whole stream and ask `any` once — one boolean out,
# one exit status in.
if grep '^{' "$SESSION_FILE" 2>/dev/null | jq -es '
    any(
      .[] | select(.type=="assistant") | .message.content[]? |
      select(.type=="tool_use") | select(.name=="Workflow") |
      (.input | tostring) | contains("\"name\":\"audit-trd\"") or contains("name: '"'"'audit-trd'"'"'");
      .
    )
' >/dev/null 2>&1; then
    assert_pass_raw "audit-trd ran (Workflow({name:\"audit-trd\"}) call found in the session log)"
else
    assert_fail_raw "audit-trd ran — no Workflow({name:\"audit-trd\"}) call found in the session log"
fi

# --- exactly one COMMAND COMPLETE banner ------------------------------------
# medium's own chain (Workflow(create-trd), Workflow(audit-trd)) emits no
# banner of its own per D5 — /plan's own terminator is the only one this run
# should ever print. Count across the WHOLE session, not just the final
# message: a second banner mid-run (e.g. a chained command printing its own)
# would still be a defect even if the transcript's last line looks correct.
ALL_ASSISTANT_TEXT="${PROJECT_DIR}/.all_assistant_text"
grep '^{' "$SESSION_FILE" 2>/dev/null | jq -rs '
    [.[] | select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text] | join("\n")
' > "$ALL_ASSISTANT_TEXT" 2>/dev/null

BANNER_COUNT=$(grep -c '═══ COMMAND COMPLETE' "$ALL_ASSISTANT_TEXT" 2>/dev/null) || BANNER_COUNT=0
if [[ "$BANNER_COUNT" -eq 1 ]]; then
    assert_pass_raw "exactly one COMMAND COMPLETE banner in the run's output"
else
    assert_fail_raw "exactly one COMMAND COMPLETE banner in the run's output — found ${BANNER_COUNT}"
fi

smoke_finish
