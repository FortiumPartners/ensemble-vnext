#!/usr/bin/env bats
#
# Two feature branches that each perform the framework's own writes must merge
# without conflicts. Fixture repo in a temp dir; no `claude` invocation.
#
# Main case: scaffold, commit the base, branch twice, merge A-then-B and B-then-A.
# Control: same writes with the ignore and union lines removed -> must conflict,
# which proves the main case can fail.

setup() {
    REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
    SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    FIXTURE="$(mktemp -d)"
    # Fixed path: `run` executes in a subshell, so a variable set inside would be lost.
    MERGE_COPY="${FIXTURE}-merge"
    cd "$FIXTURE" || return 1
    git init -q -b main .
}

teardown() {
    cd / || true
    rm -rf "$FIXTURE" "$MERGE_COPY"
}

g() { git -c user.name=t -c user.email=t@t.invalid -c commit.gpgsign=false "$@"; }

# Base: scaffold (BEFORE the first commit so nothing ignored is tracked), plus
# pre-existing content in the shared append-logs (union only matters when both
# sides modify an existing file).
make_base() {
    bash "$SCAFFOLD" "$FIXTURE" >/dev/null 2>&1
    mkdir -p .trd-state/_sweep .claude
    printf 'base\n' > .trd-state/_session-log.md
    printf '{"id":"base"}\n' > .trd-state/_sweep/discovered.jsonl
    printf 'base\n' > .claude/verification-notes.md
    # Control precondition: tracked file the main case ignores.
    printf '{"trd":"base"}\n' > .trd-state/current.json
    printf '{"n":0}\n' > .trd-state/_dispatch.jsonl
}

# What a framework session writes on a branch.
framework_writes() {
    local name="$1"
    mkdir -p .trd-state/_command-runs ".trd-state/feat-$name" .trd-state/_sweep
    printf '{"trd":"docs/TRD/%s.md"}\n' "$name" > .trd-state/current.json
    printf '{"agent":"%s"}\n' "$name" >> .trd-state/_dispatch.jsonl
    printf '{"state":"active"}\n' > ".trd-state/_command-runs/sess-$name.json"
    printf 'block %s\n' "$name" >> .trd-state/_session-log.md
    printf '{"id":"%s"}\n' "$name" >> .trd-state/_sweep/discovered.jsonl
    printf 'note %s\n' "$name" >> .claude/verification-notes.md
    printf '{"feature":"%s"}\n' "$name" > ".trd-state/feat-$name/implement.json"
    printf '{"agent":"%s"}\n' "$name" > ".trd-state/feat-$name/dispatch.jsonl"
}

branch_with_writes() {
    local name="$1"
    g checkout -q -b "feature/$name" main
    framework_writes "$name"
    g add -A
    g commit -q -m "writes $name"
}

commit_base() {
    g add -A
    # The shared logs are ignored since writers-move-to-the-ref (records live on
    # refs/ensemble/records/*). A project from before the cutover still tracks
    # them, and the union lines are their fallback: force-add to keep that case.
    local f
    for f in .trd-state/_session-log.md .trd-state/_sweep/discovered.jsonl; do
        if [ -f "$f" ]; then g add -f "$f"; fi
    done
    g commit -q -m base
}

# Copy the fixture, merge the two branches in the given order on the copy.
merge_in_order() {
    local first="$1" second="$2"
    git clone -q "$FIXTURE" "$MERGE_COPY"
    cd "$MERGE_COPY" || return 1
    g checkout -q main
    g merge --no-edit -q "origin/feature/$first" >/dev/null 2>&1 || return 1
    g merge --no-edit -q "origin/feature/$second" >/dev/null 2>&1
}

@test "framework writes on two branches merge with no conflicts, A then B" {
    make_base
    commit_base
    branch_with_writes a
    branch_with_writes b
    g checkout -q main

    run merge_in_order a b
    [ "$status" -eq 0 ]
    cd "$MERGE_COPY" || return 1
    [ -z "$(g diff --name-only --diff-filter=U)" ]
    for n in a b; do
        grep -qx "block $n" .trd-state/_session-log.md
        grep -qx "{\"id\":\"$n\"}" .trd-state/_sweep/discovered.jsonl
        grep -qx "note $n" .claude/verification-notes.md
        # A new feature's records are ignored: they go to the records ref, never the branch.
        [ -z "$(g ls-files ".trd-state/feat-$n/implement.json")" ]
    done
}

@test "framework writes on two branches merge with no conflicts, B then A" {
    make_base
    commit_base
    branch_with_writes a
    branch_with_writes b
    g checkout -q main

    run merge_in_order b a
    [ "$status" -eq 0 ]
    cd "$MERGE_COPY" || return 1
    [ -z "$(g diff --name-only --diff-filter=U)" ]
    for n in a b; do
        grep -qx "block $n" .trd-state/_session-log.md
        grep -qx "{\"id\":\"$n\"}" .trd-state/_sweep/discovered.jsonl
        grep -qx "note $n" .claude/verification-notes.md
    done
}

@test "per-session files are ignored, so they are never committed" {
    make_base
    commit_base
    branch_with_writes a
    run git ls-files .trd-state/current.json .trd-state/_dispatch.jsonl .trd-state/_command-runs ".trd-state/feat-a/dispatch.jsonl"
    [ -z "$output" ]
}

@test "CONTROL: without the ignore and union lines the same writes conflict" {
    make_base
    # Strip the framework's lines before the base commit.
    : > .gitignore
    : > .gitattributes
    commit_base
    branch_with_writes a
    branch_with_writes b
    g checkout -q main

    run merge_in_order a b
    [ "$status" -ne 0 ]
    cd "$MERGE_COPY" || return 1
    conflicted="$(g diff --name-only --diff-filter=U)"
    [ -n "$conflicted" ]
    echo "$conflicted" | grep -q "current.json"
}

@test "two branches that both run --refresh against an older stamped version merge cleanly on settings.json" {
    bash "$SCAFFOLD" --plugin-dir "${REPO_ROOT}/packages/full" "$FIXTURE" >/dev/null 2>&1
    [ -f .claude/settings.json ]
    # Make the stamp older than the plugin's version so refresh has something to change.
    python3 - <<'PY'
import json
p = ".claude/settings.json"
d = json.load(open(p))
d.setdefault("ensemble", {})["version"] = "0.0.1"
d["ensemble"].pop("refreshed_at", None)
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
PY
    commit_base

    for n in a b; do
        g checkout -q -b "feature/$n" main
        bash "$SCAFFOLD" --refresh --plugin-dir "${REPO_ROOT}/packages/full" "$FIXTURE" >/dev/null 2>&1
        g add -A
        g commit -q --allow-empty -m "refresh $n"
    done
    g checkout -q main
    [ "$(g diff main feature/a --name-only -- .claude/settings.json)" = ".claude/settings.json" ]

    run merge_in_order a b
    [ "$status" -eq 0 ]
    cd "$MERGE_COPY" || return 1
    [ -z "$(g diff --name-only --diff-filter=U)" ]
    run grep -q refreshed_at .claude/settings.json
    [ "$status" -ne 0 ]
}
