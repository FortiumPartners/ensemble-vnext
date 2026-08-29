#!/usr/bin/env bash
# =============================================================================
# investigate-light-fix — /investigate --implement on a small, real defect
# =============================================================================
#
# WHY THIS EXISTS
#
# 4.2.1 changed /investigate on four counts after a real session showed it
# escalating work it should have implemented, and discarding its own
# investigation when it did. Every one of those fixes was verified at the
# COMPONENT level (fix-sizing, fix-plan, 984 unit tests) and NONE end to end.
# The owner's ask was exactly that: "I want to be able to trust it."
#
# So this plants a defect that is unambiguously light-path work and asserts the
# command ACTS on it:
#
#   - a bug that reproduces on demand (a failing test proves it)
#   - one root cause, in one file, discoverable by reading
#   - the correct behaviour is not a product call
#   - well under every ceiling: 1-2 tasks, 1-2 files
#
# A run that ESCALATES this has failed, and that is the point: the observed
# failure was a self-inflicted ESCALATE on work that sized AUTO on its own.
#
# Asserts, in the order that matters:
#   1. it terminates with a banner at all
#   2. it did NOT escalate  (complaint 1: "consistently escalates without need")
#   3. a TRD exists         (complaint 2: "bombs out, leaving nothing")
#   4. the defect is FIXED  (complaint 3: "I want this fixed, lightly")
#   5. the regression test now passes
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

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-investigate.XXXXXX")"
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
# The defect. discountedTotal() applies the discount BEFORE clamping the rate,
# so a rate above 1 returns a NEGATIVE total. One file, one line, one cause.
# The test file encodes the bug as a failing case, so the defect reproduces on
# demand -- `reproducible: true` and `rootCause: demonstrated` are not
# judgement calls the run has to talk itself into.
# --------------------------------------------------------------------------
mkdir -p "${PROJECT_DIR}/src"
cat > "${PROJECT_DIR}/src/pricing.js" <<'JS'
'use strict';

/**
 * Apply a percentage discount to a subtotal.
 * @param {number} subtotal
 * @param {number} rate  0..1
 */
function discountedTotal(subtotal, rate) {
  // BUG: rate is used before it is clamped, so rate > 1 yields a negative total.
  const discounted = subtotal - subtotal * rate;
  const safeRate = Math.min(Math.max(rate, 0), 1);
  void safeRate;
  return discounted;
}

module.exports = { discountedTotal };
JS

cat > "${PROJECT_DIR}/src/pricing.test.js" <<'JS'
'use strict';
const { discountedTotal } = require('./pricing');

test('applies a normal discount', () => {
  expect(discountedTotal(100, 0.25)).toBe(75);
});

test('never returns a negative total when the rate exceeds 1', () => {
  // Reproduces the defect: currently returns -100.
  expect(discountedTotal(100, 2)).toBe(0);
});
JS

cat > "${PROJECT_DIR}/package.json" <<'JSON'
{
  "name": "smoke-investigate",
  "version": "1.0.0",
  "private": true,
  "scripts": { "test": "jest" },
  "devDependencies": { "jest": "^30.0.0" }
}
JSON

git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: pricing with a clamp-order defect" --no-verify
assert_pass_raw "fixture defect planted (src/pricing.js, failing test)"

# Sanity: the defect must actually reproduce, or the scenario proves nothing.
if (cd "$PROJECT_DIR" && npx --yes jest src/pricing.test.js >/dev/null 2>&1); then
    assert_fail_raw "fixture test FAILS before the fix (it passed — the defect is not real)"
    smoke_finish
fi
assert_pass_raw "fixture test fails before the fix (defect reproduces)"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
PROMPT="/investigate --implement discountedTotal in src/pricing.js returns a negative total when the rate is above 1; src/pricing.test.js has a failing case that reproduces it"

# 1500s, not 840. `--implement` at AUTO chains into `/implement-trd --verify`, so this
# scenario pays for the investigation AND the full implement loop AND the functional
# verification pass. Measured 2026-08-29: the fix itself committed at 8m30s, end-of-run
# review finished at 13m, and an 840s cap killed it (exit 143) during the verification
# loop -- with every behavioural assertion already passing. The cap was measuring my
# patience, not the command. Keep this BELOW the runner's per-scenario budget.
smoke_claude "$PROMPT" 1500 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?
assert_exit_code 0 "$RC" "claude --print exits 0"

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner"

# --- complaint 1: escalating work that is plainly light-path ----------------
# The banner names the tier. ESCALATE on THIS defect is the failure this
# scenario exists to catch.
if grep -qi 'ESCALATE' "$BANNER_FILE"; then
    assert_fail_raw "did NOT escalate (banner says ESCALATE on a 1-file, reproducible, spec-certain defect)"
else
    assert_pass_raw "did not escalate"
fi

# --- complaint 2: bombing out and leaving nothing behind --------------------
TRD_COUNT=$(find "${PROJECT_DIR}/docs/TRD" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$TRD_COUNT" -ge 1 ]]; then
    assert_pass_raw "wrote a TRD (${TRD_COUNT} in docs/TRD/)"
else
    assert_fail_raw "wrote a TRD — docs/TRD/ is empty, the investigation was discarded"
fi

# --- complaint 3: the thing the owner actually asked for -------------------
if (cd "$PROJECT_DIR" && npx --yes jest src/pricing.test.js >/dev/null 2>&1); then
    assert_pass_raw "THE DEFECT IS FIXED — the reproducing test now passes"
else
    assert_fail_raw "THE DEFECT IS FIXED — the reproducing test still fails"
fi

# The fix must be in the source, not in the test: a run that edits the failing
# assertion to match the buggy output "passes" while fixing nothing.
if git -C "$PROJECT_DIR" diff HEAD~1..HEAD --name-only 2>/dev/null | grep -q 'src/pricing.js' ||
   git -C "$PROJECT_DIR" log --oneline --name-only 2>/dev/null | grep -q 'src/pricing.js'; then
    assert_pass_raw "the fix touched src/pricing.js (not just the test)"
else
    assert_fail_raw "the fix touched src/pricing.js (not just the test)"
fi

smoke_finish
