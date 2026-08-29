#!/usr/bin/env bash
# =============================================================================
# investigate-decoy-root-cause — the reported cause is WRONG
# =============================================================================
#
# WHY THIS EXISTS
#
# investigate-light-fix proves /investigate does not escalate a defect that is
# impossible to escalate honestly: 16 lines, one file, and a `// BUG:` comment
# naming the cause. It is a floor, not a test of judgement.
#
# This one tests the owner's SECOND complaint, which that fixture does not touch:
# "it does its investigation, discovers a true root cause (different than
# originally suspected), and then effectively bombs out."
#
# So the report is a DECOY. The user blames the discount logic; the discount
# logic is correct. The real cause is a money-rounding helper in a different
# file that truncates instead of rounding. Nothing names the bug — it has to be
# found by reading three collaborating files and reasoning about which one lies.
#
# The decisive assertion is WHERE the fix landed:
#   - src/money.js   changed  -> it found the real cause
#   - src/discount.js changed -> it "fixed" the decoy the report pointed at
#
# A run that edits the decoy makes the test pass while fixing nothing, which is
# exactly the failure mode worth catching.
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

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-decoy.XXXXXX")"
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

mkdir -p "${PROJECT_DIR}/src"

# THE REAL CAUSE. Truncates instead of rounding, so 89.995 -> 89.99, not 90.00.
# No comment marks it. It reads like ordinary, slightly-clumsy money code.
cat > "${PROJECT_DIR}/src/money.js" <<'JS'
'use strict';

/** Round a monetary amount to whole cents. */
function roundMoney(amount) {
  return Math.trunc(amount * 100) / 100;
}

module.exports = { roundMoney };
JS

# THE DECOY. The report blames this file. It is correct: one discount, once.
cat > "${PROJECT_DIR}/src/discount.js" <<'JS'
'use strict';

/**
 * Apply a single percentage discount. Deliberately simple: the rate is applied
 * exactly once, and the caller is responsible for rounding.
 */
function applyDiscount(subtotal, rate) {
  return subtotal * (1 - rate);
}

module.exports = { applyDiscount };
JS

cat > "${PROJECT_DIR}/src/cart.js" <<'JS'
'use strict';
const { applyDiscount } = require('./discount');
const { roundMoney } = require('./money');

function cartTotal(subtotal, rate) {
  return roundMoney(applyDiscount(subtotal, rate));
}

module.exports = { cartTotal };
JS

cat > "${PROJECT_DIR}/src/cart.test.js" <<'JS'
'use strict';
const { cartTotal } = require('./cart');
const { applyDiscount } = require('./discount');

test('a 10% discount on 99.995 rounds to 90.00', () => {
  // Currently 89.99: the total is one cent light.
  expect(cartTotal(99.995, 0.1)).toBe(90);
});

test('the discount itself is applied exactly once', () => {
  // This ALREADY PASSES. It pins the decoy: a run that "fixes" discount.js
  // to chase the reported cause breaks this and cannot claim success.
  expect(applyDiscount(100, 0.1)).toBeCloseTo(90, 10);
});
JS

cat > "${PROJECT_DIR}/package.json" <<'JSON'
{
  "name": "smoke-decoy",
  "version": "1.0.0",
  "private": true,
  "scripts": { "test": "jest" },
  "devDependencies": { "jest": "^30.0.0" }
}
JSON

git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: cart with a rounding defect and a discount decoy" --no-verify
# Baseline for the "which files did the RUN change?" assertions below. Capturing the sha
# here is the only correct way: the fixture commit CREATED discount.js, so any diff range
# that includes it reports the decoy as touched no matter what the run did. The first
# version of this scenario got that wrong twice over -- a hard-coded sha copy-pasted from
# investigate-light-fix, plus an unbounded `git log --name-only` -- and reported a false
# failure against a run that had behaved perfectly.
FIXTURE_SHA="$(git -C "$PROJECT_DIR" rev-parse HEAD)"
assert_pass_raw "fixture planted (3 collaborating files, no comment names the bug)"

if (cd "$PROJECT_DIR" && npx --yes jest src/cart.test.js >/dev/null 2>&1); then
    assert_fail_raw "fixture test FAILS before the fix (it passed — the defect is not real)"
    smoke_finish
fi
assert_pass_raw "fixture test fails before the fix (defect reproduces)"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
# The report names the WRONG file and the WRONG cause, the way a real one does.
PROMPT="/investigate --implement the cart total comes out a cent light on discounted orders — looks like the discount in src/discount.js is being applied twice"

smoke_claude "$PROMPT" 1500 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?
assert_exit_code 0 "$RC" "claude --print exits 0"

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner"

if grep -qi 'ESCALATE' "$BANNER_FILE"; then
    assert_fail_raw "did NOT escalate (a one-file rounding fix, found by reading three small files)"
else
    assert_pass_raw "did not escalate"
fi

TRD_COUNT=$(find "${PROJECT_DIR}/docs/TRD" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$TRD_COUNT" -ge 1 ]]; then
    assert_pass_raw "wrote a TRD (${TRD_COUNT} in docs/TRD/)"
else
    assert_fail_raw "wrote a TRD — docs/TRD/ is empty, the investigation was discarded"
fi

if (cd "$PROJECT_DIR" && npx --yes jest src/cart.test.js >/dev/null 2>&1); then
    assert_pass_raw "THE DEFECT IS FIXED — both cart tests pass"
else
    assert_fail_raw "THE DEFECT IS FIXED — the reproducing test still fails"
fi

# THE POINT OF THIS SCENARIO. Did it follow the evidence, or the report?
# Only what the RUN changed: commits after the fixture, plus any uncommitted work.
CHANGED="$(
  git -C "$PROJECT_DIR" log --format="" --name-only "${FIXTURE_SHA}..HEAD" 2>/dev/null
  git -C "$PROJECT_DIR" diff --name-only "${FIXTURE_SHA}" 2>/dev/null
)"
if grep -q 'src/money.js' <<<"$CHANGED"; then
    assert_pass_raw "found the REAL root cause — src/money.js was changed"
else
    assert_fail_raw "found the REAL root cause — src/money.js was never changed"
fi
if grep -q 'src/discount.js' <<<"$CHANGED"; then
    assert_fail_raw "did not 'fix' the decoy — src/discount.js was changed, but it was correct"
else
    assert_pass_raw "did not 'fix' the decoy — src/discount.js untouched"
fi

smoke_finish
