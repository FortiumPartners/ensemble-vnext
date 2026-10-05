#!/usr/bin/env bats
# =============================================================================
# audit-docs.test.sh - Integration test for /audit-docs (DABS-T002)
# =============================================================================
# Builds a fixture repository whose docs are wrong in known ways, scaffolds the
# runtime into it, runs /audit-docs three times headless, and asserts on git
# state and files. Source: docs/TRD/docs-as-built.md (D4, D10, D15, D17).
#
#   run 1  /audit-docs --comprehensive          -> review branch, left UNMERGED
#   run 2  /audit-docs (light)                  -> the marker is on the unmerged
#                                                  branch only, so this run must
#                                                  re-cover run 1's documents
#   run 3  /audit-docs (light), FRESH CLONE     -> after merging run 1's branch,
#          of the remote                           the merged marker is seen
#
# Two kinds of test:
#   - fixture tests: deterministic, need no claude session, run by default
#   - headless tests: spend model calls, SKIPPED unless SKIP_HEADLESS=false and
#     the claude CLI is installed (same gate as commands.test.sh)
#
# Run:   bats test/integration/tests/audit-docs.test.sh
# Live:  SKIP_HEADLESS=false bats test/integration/tests/audit-docs.test.sh
# =============================================================================

BATS_TEST_DIRNAME="$(cd "$(dirname "${BATS_TEST_FILENAME}")" && pwd)"
source "${BATS_TEST_DIRNAME}/helpers/setup.sh"

# Fixture marker sentences, asserted on by the tests below.
VALID_MARK="The nightly job runs at 02:00 UTC."
STALE_MARK="Reports are rendered by the legacy Flask renderer."

_state_file() {
    echo "${BATS_FILE_TMPDIR:-/tmp}/audit-docs-test-state"
}

# Headless tests need the claude CLI; default is to skip them.
_headless_enabled() {
    [[ "${SKIP_HEADLESS:-true}" != "true" ]] && command -v claude &>/dev/null
}

_commit() {
    git -C "$1" add -A
    git -C "$1" commit -q -m "$2"
}

# Build the fixture repo under $1 with a bare remote at $2.
_build_fixture() {
    local repo="$1" remote="$2"
    mkdir -p "$repo" "$remote"
    git init -q --bare "$remote"
    git -C "$repo" init -q -b main .
    git -C "$repo" config user.email "test@example.com"
    git -C "$repo" config user.name "Test"
    git -C "$repo" remote add origin "$remote"

    mkdir -p "$repo"/{src,test,docs/PRD,docs/TRD,docs/guides,docs/data,docs/ops,.github/workflows}

    # --- docs written FIRST, code changes after, so the docs are stale ------
    cat > "$repo/docs/PRD/greeter.md" <<'DOC'
# Greeter PRD

## Feature Requirements

### F1 Shout flag
`greet --shout NAME` prints the greeting in upper case.

### F2 CSV export
`greet --export csv` writes every greeting issued to `greetings.csv`.

## Acceptance Criteria
- AC-F1: `--shout` upper-cases the greeting.
- AC-F2: `--export csv` creates `greetings.csv`.
DOC
    cat > "$repo/docs/TRD/greeter.md" <<'DOC'
# Greeter TRD

Status: Complete

## Master Task List

| ID | Task | Touches |
|----|------|---------|
| GR-001 | Add the shout flag | src/greet.js |
| GR-002 | Add CSV export | src/export.js |

### GR-001
Touches:
- src/greet.js

### GR-002
Touches:
- src/export.js
DOC
    cat > "$repo/docs/PRD/brief.source.md" <<'DOC'
# Raw brief from the customer

They want a friendlier greeter. No requirements are numbered here.
DOC
    cat > "$repo/docs/guides/operations.md" <<DOC
# Operations guide

## Scheduling
${VALID_MARK}

## Reporting
${STALE_MARK}
DOC
    printf 'name,count\nada,3\n' > "$repo/docs/data/ci-fixture.csv"
    cat > "$repo/docs/ops/runbook.md" <<'DOC'
# Runbook

## Restarting the queue worker
Restart the `QueueWorker` service with `systemctl restart queue-worker`.
DOC
    cat > "$repo/docs/guides/other-repo.md" <<'DOC'
# Integration notes

The shared client lives in `billing-service/src/client/retry.js`, in the billing repo.
DOC
    cat > "$repo/.github/workflows/ci.yml" <<'YML'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: node test/greet.test.js docs/data/ci-fixture.csv
YML
    echo '# fixture' > "$repo/README.md"
    _commit "$repo" "docs: initial PRD, TRD and guides"

    # --- code lands after the docs: built differently / not built ----------
    cat > "$repo/src/greet.js" <<'JS'
'use strict';
// The flag shipped as --loud, not --shout as the PRD says.
module.exports = (name, opts = {}) => (opts.loud ? `HELLO ${name}`.toUpperCase() : `hello ${name}`);
JS
    cat > "$repo/test/greet.test.js" <<'JS'
'use strict';
// Reads docs/data/ci-fixture.csv: the data file's only readers are this test and ci.yml.
const fs = require('fs');
fs.readFileSync('docs/data/ci-fixture.csv', 'utf8');
JS
    _commit "$repo" "feat: greet with --loud flag"
    git -C "$repo" push -q origin main
}

setup_file() {
    export QUIET="true"
    if ! command -v git &>/dev/null; then return 0; fi

    local root
    root="$(mktemp -d -t ensemble-test-audit-docs.XXXXXX)"
    local repo="$root/repo" remote="$root/remote.git" clone="$root/clone"
    _build_fixture "$repo" "$remote"

    # Scaffold the runtime, then set the thresholds (D5) and commit it all.
    bash "${PROJECT_ROOT}/packages/core/scripts/scaffold-project.sh" "$repo" \
        --plugin-dir "${PLUGIN_ROOT}" > "$root/scaffold.log" 2>&1 || true
    if command -v jq &>/dev/null && [[ -f "$repo/.claude/settings.json" ]]; then
        jq '.ensemble.docsAudit.thresholds = {high: 70, medium: 40}' \
            "$repo/.claude/settings.json" > "$root/settings.tmp" \
            && mv "$root/settings.tmp" "$repo/.claude/settings.json"
    fi
    _commit "$repo" "chore: scaffold runtime and set docs-audit thresholds"
    git -C "$repo" push -q origin main

    # An untracked doc: must be reported and left exactly as written.
    printf '# Scratch notes\nNot committed.\n' > "$repo/docs/guides/scratch.md"
    cp "$repo/docs/guides/scratch.md" "$root/scratch.before"

    cat > "$(_state_file)" <<STATE
ROOT="$root"
REPO="$repo"
REMOTE="$remote"
CLONE="$clone"
HEAD_BEFORE="$(git -C "$repo" rev-parse HEAD)"
STATE

    if _headless_enabled; then
        local sid1 sid2 sid3
        # Timeout 3600s: a comprehensive run fans out scorers, verifiers and
        # apply agents; one /create-trd alone has a 1384s median here.
        sid1=$(run_headless_session "/audit-docs --comprehensive" "$repo" 3600 2>/dev/null | tail -1) || true
        local branch1
        branch1=$(git -C "$repo" branch --list 'docs-audit/*' --format='%(refname:short)' | head -1)

        # Run 2 needs a new HEAD sha (the branch name embeds it). A source-only
        # commit leaves every doc's window alone. The first branch is NOT merged.
        printf '// touched\n' >> "$repo/src/greet.js"
        git -C "$repo" commit -q -am "chore: touch source between runs"
        sid2=$(run_headless_session "/audit-docs" "$repo" 3600 2>/dev/null | tail -1) || true
        local branch2
        branch2=$(git -C "$repo" branch --list 'docs-audit/*' --format='%(refname:short)' | grep -vxF "$branch1" | head -1)

        # Merge run 1's branch, publish, and run 3 in a FRESH clone.
        git -C "$repo" merge -q --no-ff -m "merge docs audit" "$branch1" || true
        git -C "$repo" push -q origin main
        git clone -q "$remote" "$clone"
        git -C "$clone" config user.email "test@example.com"
        git -C "$clone" config user.name "Test"
        sid3=$(run_headless_session "/audit-docs" "$clone" 3600 2>/dev/null | tail -1) || true
        local branch3
        branch3=$(git -C "$clone" branch --list 'docs-audit/*' --format='%(refname:short)' | head -1)

        cat >> "$(_state_file)" <<STATE
SID1="$sid1"
SID2="$sid2"
SID3="$sid3"
BRANCH1="$branch1"
BRANCH2="$branch2"
BRANCH3="$branch3"
STATE
    fi
}

teardown_file() {
    if [[ -f "$(_state_file)" ]]; then
        # shellcheck source=/dev/null
        source "$(_state_file)"
        if [[ "${PRESERVE_TEST_DIR:-false}" == "true" ]]; then
            echo "# Preserved test directory: ${ROOT:-}" >&3
        elif [[ -n "${ROOT:-}" ]]; then
            cleanup_temp_dir "$ROOT" 2>/dev/null || true
        fi
        rm -f "$(_state_file)"
    fi
}

setup() {
    # shellcheck source=/dev/null
    [[ -f "$(_state_file)" ]] && source "$(_state_file)"
    return 0
}

_need_headless() {
    if ! _headless_enabled; then
        skip "Headless tests disabled (set SKIP_HEADLESS=false and install the claude CLI)"
    fi
    [[ -n "${BRANCH1:-}" ]] || { echo "run 1 produced no docs-audit branch" >&2; return 1; }
}

# Change set text for a branch (D17), read from the branch, not the work tree.
_change_set() {
    local repo="$1" branch="$2" f
    f=$(git -C "$repo" ls-tree -r --name-only "$branch" -- .trd-state/_docs-audit/runs | head -1)
    git -C "$repo" show "${branch}:${f}"
}

# =============================================================================
# Fixture tests (deterministic, no claude session)
# =============================================================================

@test "fixture: repo, remote and scaffolded runtime are in place" {
    [[ -d "$REPO/.git" ]]
    [[ -f "$REPO/.claude/lib/docs-audit-assemble.js" ]]
    [[ -f "$REPO/.claude/commands/audit-docs.md" || -f "$REPO/.claude/commands/core/audit-docs.md" ]]
    [[ "$(git -C "$REPO" ls-remote --heads origin main | wc -l | tr -d ' ')" == "1" ]]
}

@test "fixture: docs are wrong in the known ways" {
    grep -q "Status: Complete" "$REPO/docs/TRD/greeter.md"
    grep -q -- "--shout" "$REPO/docs/PRD/greeter.md"
    grep -q -- "loud" "$REPO/src/greet.js"
    [[ ! -e "$REPO/src/export.js" ]]
    grep -q "$VALID_MARK" "$REPO/docs/guides/operations.md"
    grep -q "$STALE_MARK" "$REPO/docs/guides/operations.md"
    [[ ! -e "$REPO/src/queue-worker.js" ]]
    grep -q "billing-service/src/client/retry.js" "$REPO/docs/guides/other-repo.md"
}

@test "fixture: the data file is read only by the CI config and a test" {
    run git -C "$REPO" grep -l -F "ci-fixture.csv"
    [[ "$status" -eq 0 ]]
    [[ "$output" == *".github/workflows/ci.yml"* ]]
    [[ "$output" == *"test/greet.test.js"* ]]
}

@test "fixture: the untracked doc is untracked and the tree is otherwise clean" {
    run git -C "$REPO" ls-files --error-unmatch docs/guides/scratch.md
    [[ "$status" -ne 0 ]]
    [[ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]
}

@test "fixture: thresholds are set in the project settings" {
    command -v jq &>/dev/null || skip "jq not installed"
    [[ "$(jq -r '.ensemble.docsAudit.thresholds.high' "$REPO/.claude/settings.json")" == "70" ]]
    [[ "$(jq -r '.ensemble.docsAudit.thresholds.medium' "$REPO/.claude/settings.json")" == "40" ]]
}

@test "assemble: deterministic half runs on the fixture with no model" {
    # The library half of /audit-docs, run directly: no claude session.
    local out="$ROOT/assembly.json"
    run node "$REPO/.claude/lib/docs-audit-assemble.js" assemble --repo "$REPO" \
        --run-date 2026-01-01 --comprehensive --out "$out"
    [[ "$status" -eq 0 ]]
    command -v jq &>/dev/null || skip "jq not installed"
    jq -e '.files | length > 0' "$out" >/dev/null
}

# =============================================================================
# Headless tests (model-spending, skipped by default)
# =============================================================================

@test "run 1: the review branch exists locally and is absent from the remote" {
    _need_headless
    [[ "$BRANCH1" == docs-audit/* ]]
    [[ -z "$(git -C "$REPO" ls-remote --heads origin 'docs-audit/*')" ]]
}

@test "run 1: no superseded/archived banner was added to any doc" {
    _need_headless
    run bash -c "git -C '$REPO' diff '$HEAD_BEFORE'..'$BRANCH1' -- docs | grep -E '^\+' | grep -v '^+++' | grep -iE '(superseded|archived|deprecated)' | grep -iE '(this (document|doc|section)|^\+ *> |status:)'"
    [[ "$status" -ne 0 ]]
}

@test "run 1: the part-stale doc keeps its valid section and loses the stale one" {
    _need_headless
    local after
    after=$(git -C "$REPO" show "${BRANCH1}:docs/guides/operations.md")
    [[ "$after" == *"$VALID_MARK"* ]]
    [[ "$after" != *"$STALE_MARK"* ]]
}

@test "run 1: the CI-read data file survives and is listed as blocked" {
    _need_headless
    git -C "$REPO" cat-file -e "${BRANCH1}:docs/data/ci-fixture.csv"
    _change_set "$REPO" "$BRANCH1" | awk '/^## Removals blocked/{f=1;next} /^## /{f=0} f' \
        | grep -q "docs/data/ci-fixture.csv" || {
        # Blocked only if a reviewer proposed it; otherwise it is simply untouched.
        ! git -C "$REPO" diff --name-only --diff-filter=D "$HEAD_BEFORE".."$BRANCH1" | grep -q "ci-fixture.csv"
    }
}

@test "run 1: the untracked doc is untouched and reported" {
    _need_headless
    cmp "$REPO/docs/guides/scratch.md" "$ROOT/scratch.before"
    run git -C "$REPO" ls-files --error-unmatch docs/guides/scratch.md
    [[ "$status" -ne 0 ]]
    _change_set "$REPO" "$BRANCH1" | grep -q "docs/guides/scratch.md"
}

@test "run 1: every removal has a recovery record in the change set" {
    _need_headless
    local cs removed p
    cs=$(_change_set "$REPO" "$BRANCH1")
    removed=$(git -C "$REPO" diff --name-only --diff-filter=D "$HEAD_BEFORE".."$BRANCH1" -- docs)
    for p in $removed; do
        [[ "$cs" == *"git show "*":${p}"* ]] || { echo "no recovery record for $p" >&2; return 1; }
    done
}

@test "run 1: the indexes match the tree" {
    _need_headless
    local f idx
    idx=$(git -C "$REPO" show "${BRANCH1}:docs/PRD/INDEX.md")
    for f in $(git -C "$REPO" ls-tree -r --name-only "$BRANCH1" -- docs/PRD | grep -v INDEX.md); do
        git -C "$REPO" show "${BRANCH1}:${f}" | grep -q "Feature Requirements" || continue
        [[ "$idx" == *"$f"* ]] || { echo "PRD index misses $f" >&2; return 1; }
    done
    idx=$(git -C "$REPO" show "${BRANCH1}:docs/TRD/INDEX.md")
    for f in $(git -C "$REPO" ls-tree -r --name-only "$BRANCH1" -- docs/TRD | grep -v INDEX.md); do
        git -C "$REPO" show "${BRANCH1}:${f}" | grep -q "Master Task List" || continue
        [[ "$idx" == *"$f"* ]] || { echo "TRD index misses $f" >&2; return 1; }
    done
}

@test "run 1: the marker is on the branch only" {
    _need_headless
    git -C "$REPO" cat-file -e "${BRANCH1}:.trd-state/_docs-audit/last-run.json"
    run git -C "$REPO" cat-file -e "${HEAD_BEFORE}:.trd-state/_docs-audit/last-run.json"
    [[ "$status" -ne 0 ]]
}

@test "run 1: the cross-repo path is unchanged and reported" {
    _need_headless
    local after
    after=$(git -C "$REPO" show "${BRANCH1}:docs/guides/other-repo.md")
    [[ "$after" == *"billing-service/src/client/retry.js"* ]]
    _change_set "$REPO" "$BRANCH1" | grep -q "billing-service/src/client/retry.js"
}

@test "run 1: the misclassified file in docs/PRD is reported as a class disagreement" {
    _need_headless
    _change_set "$REPO" "$BRANCH1" | grep -q "Class disagreement: .*brief.source.md"
}

@test "run 2: the unmerged marker is invisible, so run 1's documents are re-covered" {
    _need_headless
    [[ -n "$BRANCH2" && "$BRANCH2" != "$BRANCH1" ]]
    local cs1 cs2 p
    cs1=$(_change_set "$REPO" "$BRANCH1")
    cs2=$(_change_set "$REPO" "$BRANCH2")
    [[ "$cs2" == *"Mode: comprehensive"* ]]
    for p in docs/PRD/greeter.md docs/TRD/greeter.md; do
        [[ "$cs1" == *"$p"* && "$cs2" == *"$p"* ]] || { echo "not re-covered: $p" >&2; return 1; }
    done
}

@test "run 3: a fresh clone after the merge sees the merged marker" {
    _need_headless
    [[ -n "$BRANCH3" ]]
    git -C "$CLONE" cat-file -e "main:.trd-state/_docs-audit/last-run.json"
    _change_set "$CLONE" "$BRANCH3" | grep -q "Mode: light"
}

@test "all runs: the session log shows no AskUserQuestion" {
    _need_headless
    local sid
    for sid in "$SID1" "$SID2" "$SID3"; do
        [[ -n "$sid" ]] || continue
        run check_tool_invoked "$sid" "AskUserQuestion"
        [[ "$status" -ne 0 ]]
    done
}
