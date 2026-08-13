#!/usr/bin/env bash
# =============================================================================
# assert.sh - Shared assertion helpers for the behavioral smoke harness
# =============================================================================
#
# Sourced by every file in test/smoke/scenarios/. Provides a tiny assertion
# vocabulary over *observable side effects* (files, exit codes, JSON fields,
# git state, log content) — never output quality. Each scenario is expected
# to `source` this file, make a series of assert_* calls, then call
# `smoke_finish` (success/failure) or `smoke_skip` (environment precondition
# not met, e.g. no `claude` CLI).
#
# Contract with run-smoke.sh:
#   - Scenario stdout ends with a line "ASSERTIONS: <pass> passed, <fail> failed"
#     which the runner parses for the per-scenario assertion count.
#   - Scenario exit code: 0 = pass, 1 = fail, 2 = skip (never reported as pass).
#
# =============================================================================

# Not `set -e`: assertion helpers must be able to record a failure and keep
# going so a scenario reports ALL failing assertions, not just the first.
set -uo pipefail

ASSERT_PASS_COUNT=0
ASSERT_FAIL_COUNT=0

_assert_ts() { date '+%H:%M:%S'; }

assert_pass_raw() {
    ASSERT_PASS_COUNT=$((ASSERT_PASS_COUNT + 1))
    echo "  [$(_assert_ts)] PASS: $1"
}

assert_fail_raw() {
    ASSERT_FAIL_COUNT=$((ASSERT_FAIL_COUNT + 1))
    echo "  [$(_assert_ts)] FAIL: $1" >&2
}

# assert_exit_code <expected> <actual> <description>
assert_exit_code() {
    local expected="$1" actual="$2" desc="$3"
    if [[ "$actual" == "$expected" ]]; then
        assert_pass_raw "$desc (exit=$actual)"
    else
        assert_fail_raw "$desc (expected exit=$expected, got exit=$actual)"
    fi
}

# assert_true <description> -- <command...>
# Runs the command; passes if exit 0.
assert_true() {
    local desc="$1"
    shift
    if [[ "${1:-}" == "--" ]]; then shift; fi
    if "$@" >/dev/null 2>&1; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc"
    fi
}

# assert_file_exists <path> <description>
assert_file_exists() {
    local path="$1" desc="${2:-file exists: $1}"
    if [[ -e "$path" ]]; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc (not found: $path)"
    fi
}

# assert_file_nonempty <path> <description>
assert_file_nonempty() {
    local path="$1" desc="${2:-file non-empty: $1}"
    if [[ -s "$path" ]]; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc (missing or empty: $path)"
    fi
}

# assert_contains <haystack_file> <needle> <description>
assert_contains() {
    local file="$1" needle="$2" desc="${3:-contains '$2'}"
    if [[ -f "$file" ]] && grep -qF -- "$needle" "$file" 2>/dev/null; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc (needle not found in $file)"
    fi
}

# assert_str_contains <haystack_string> <needle> <description>
assert_str_contains() {
    local haystack="$1" needle="$2" desc="${3:-contains '$2'}"
    if [[ "$haystack" == *"$needle"* ]]; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc"
    fi
}

# assert_last_line_matches <file> <regex> <description>
# Scans from the end of the file for the last non-blank line and matches it
# against an ERE.
assert_last_line_matches() {
    local file="$1" regex="$2" desc="${3:-last line matches /$2/}"
    if [[ ! -f "$file" ]]; then
        assert_fail_raw "$desc (file not found: $file)"
        return
    fi
    local last_line
    last_line=$(grep -v '^[[:space:]]*$' "$file" 2>/dev/null | tail -1)
    if [[ "$last_line" =~ $regex ]]; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc (last non-blank line was: ${last_line:0:200})"
    fi
}

# assert_tail_matches <file> <n_lines> <regex> <description>
# Matches an ERE against the last <n_lines> non-blank lines of <file> (joined),
# rather than requiring the regex to hit the literal last line. Use this for
# the COMMAND COMPLETE/STUCK banner: per .claude/rules/command-status.md the
# banner's contract is a glyph line ("═══ COMMAND COMPLETE: /cmd ═══")
# immediately followed by a one-line summary — the summary, not the glyph
# line, ends up as the literal last line. Checking only the last line missed
# this the first time this harness was run for real; see test/smoke/README.md.
#
# Window sizing: COMPLETE is glyph + one summary line, but STUCK is glyph +
# "Reason:" + "Next:", and BOTH of those can wrap to several physical lines
# when the model writes a long reason. A 3-line window passed against a
# COMPLETE run and then failed against a STUCK one for that reason alone —
# looking like flakiness when it was the window being too small for the
# documented STUCK shape. Size the window for the wrapped-STUCK worst case.
assert_tail_matches() {
    local file="$1" n="$2" regex="$3" desc="${4:-tail matches /$3/}"
    if [[ ! -f "$file" ]]; then
        assert_fail_raw "$desc (file not found: $file)"
        return
    fi
    local tail_content
    tail_content=$(grep -v '^[[:space:]]*$' "$file" 2>/dev/null | tail -n "$n")
    if [[ "$tail_content" =~ $regex ]]; then
        assert_pass_raw "$desc"
    else
        assert_fail_raw "$desc (last ${n} non-blank line(s): ${tail_content:0:300})"
    fi
}

# assert_json_valid_or_empty <string> <description>
# Passes if the string is empty/whitespace-only, OR is valid JSON.
assert_json_valid_or_empty() {
    local str="$1" desc="${2:-stdout empty or valid JSON}"
    if [[ -z "${str// /}" ]]; then
        assert_pass_raw "$desc (empty)"
        return
    fi
    if echo "$str" | jq -e . >/dev/null 2>&1; then
        assert_pass_raw "$desc (valid JSON)"
    else
        assert_fail_raw "$desc (neither empty nor valid JSON: ${str:0:200})"
    fi
}

# assert_json_field <json_file> <jq_expr> <expected> <description>
assert_json_field() {
    local file="$1" expr="$2" expected="$3" desc="${4:-$2 == $3}"
    if [[ ! -f "$file" ]]; then
        assert_fail_raw "$desc (file not found: $file)"
        return
    fi
    local actual
    actual=$(jq -r "$expr" "$file" 2>/dev/null)
    if [[ "$actual" == "$expected" ]]; then
        assert_pass_raw "$desc (got: $actual)"
    else
        assert_fail_raw "$desc (expected: $expected, got: $actual)"
    fi
}

# assert_git_branch <repo_dir> <expected_regex> <description>
assert_git_branch() {
    local repo_dir="$1" expected_regex="$2" desc="${3:-on expected branch}"
    local actual
    actual=$(git -C "$repo_dir" branch --show-current 2>/dev/null)
    if [[ "$actual" =~ $expected_regex ]]; then
        assert_pass_raw "$desc (branch: $actual)"
    else
        assert_fail_raw "$desc (branch was: $actual, expected match: $expected_regex)"
    fi
}

# smoke_timeout <seconds> <cmd...> - portable timeout wrapper.
#
# Prefers GNU `timeout`/`gtimeout` when present. Neither ships by default on
# macOS without `brew install coreutils` (confirmed absent on the machine
# this harness was built on) — falls back to a perl fork/alarm/kill
# implementation so the harness doesn't silently require a package the base
# OS doesn't provide. Exit 124 signals a timeout, matching GNU `timeout`'s
# convention, so callers can treat 124 uniformly regardless of which path ran.
smoke_timeout() {
    local secs="$1"
    shift
    if command -v timeout &>/dev/null; then
        timeout "$secs" "$@"
        return $?
    elif command -v gtimeout &>/dev/null; then
        gtimeout "$secs" "$@"
        return $?
    else
        perl -e '
            my $secs = shift @ARGV;
            my $pid = fork();
            if (!defined $pid) { exit 127; }
            if ($pid == 0) { exec @ARGV or exit 127; }
            local $SIG{ALRM} = sub { kill "TERM", $pid; sleep 1; kill "KILL", $pid; };
            alarm($secs);
            waitpid($pid, 0);
            alarm(0);
            my $rc = $?;
            exit(($rc & 127) ? 124 : ($rc >> 8));
        ' "$secs" "$@"
        return $?
    fi
}

# smoke_finish - print the summary line and exit 0/1 accordingly.
smoke_finish() {
    echo "ASSERTIONS: ${ASSERT_PASS_COUNT} passed, ${ASSERT_FAIL_COUNT} failed"
    if [[ "$ASSERT_FAIL_COUNT" -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# smoke_skip <reason> - scenario precondition not met (e.g. no claude CLI).
# Never counted as a pass or a fail by the runner.
smoke_skip() {
    echo "SKIP: $1"
    echo "ASSERTIONS: 0 passed, 0 failed"
    exit 2
}
