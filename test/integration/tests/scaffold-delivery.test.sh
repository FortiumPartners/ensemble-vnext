#!/usr/bin/env bats
#
# Scaffold delivery — what a consuming project ACTUALLY receives.
#
# This runs the real scaffold script into a real temp tree and asserts on the
# result. No `claude` invocation, so it runs in CI.
#
# Why it exists: `packages/full` is built almost entirely out of symlinks into
# `packages/core` — 32 of them, including whole directories (`commands/core`,
# `hooks/lib`) and every `lib/*.js`. That is right for development and wrong for
# delivery: a symlink copied AS a symlink points at a plugin path the consuming
# project does not have, so it arrives dangling. It fails silently — the file
# lists, the directory looks populated, and the first `require` is where it
# surfaces, in someone else's project.
#
# BSD `cp -r` preserves symlinks; `cp -L` / `cp -RL` dereference. The script uses
# the dereferencing forms, and this test is what keeps it that way.

setup_file() {
    set -euo pipefail
    REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
    export REPO_ROOT
    export SCAFFOLD="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    export PLUGIN_DIR="${REPO_ROOT}/packages/full"

    TREE="$(mktemp -d)"
    export TREE
    git -C "$TREE" init -q .
    git -C "$TREE" commit -q --allow-empty -m init

    # --plugin-dir is what carries the payload. Without it the script creates
    # directories and templates and exits 0 having delivered nothing else.
    bash "$SCAFFOLD" "$TREE" --plugin-dir "$PLUGIN_DIR" > "$TREE/scaffold.log" 2>&1
    echo "$?" > "$TREE/scaffold.exit"
}

teardown_file() {
    [ -n "${TREE:-}" ] && rm -rf "$TREE"
}

@test "scaffold exits 0" {
    [ "$(cat "$TREE/scaffold.exit")" = "0" ]
}

@test "scaffold delivers NO symlinks at all" {
    run find "$TREE/.claude" -type l
    [ "$status" -eq 0 ]
    if [ -n "$output" ]; then
        printf 'Symlinks delivered into a consuming project:\n%s\n' "$output" >&2
        return 1
    fi
}

@test "scaffold delivers no dangling paths" {
    # Belt to the previous test's braces: catches a broken link that somehow
    # is not reported as type l, and any other unresolvable entry.
    run find "$TREE/.claude" ! -exec test -e {} \; -print
    [ -z "$output" ]
}

@test "every payload directory is actually populated" {
    # A tree with zero symlinks because it received zero files would pass the
    # test above. That is exactly how the first run of this check misled its
    # author, so the assertion is here rather than assumed.
    local thin=()
    for d in commands agents lib hooks contracts workflows rules; do
        local n
        n="$(find "$TREE/.claude/$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
        [ "$n" -ge 4 ] || thin+=("$d=$n")
    done
    if [ "${#thin[@]}" -gt 0 ]; then
        printf 'Payload directories under-populated: %s\n' "${thin[*]}" >&2
        return 1
    fi
}

@test "delivered lib modules are real files that load" {
    for m in trd-parser task-graph implement-state fix-sizing fix-plan fix-audit; do
        [ -f "$TREE/.claude/lib/${m}.js" ]
        [ ! -L "$TREE/.claude/lib/${m}.js" ]
        run node -e 'require(process.argv[1])' "$TREE/.claude/lib/${m}.js"
        [ "$status" -eq 0 ]
    done
}

@test "every hook registered as a command exists and is executable" {
    # The registration is the contract: whatever settings.json invokes must be
    # on disk with the execute bit. Files under hooks/lib/ are require()d rather
    # than invoked and are deliberately not checked.
    run node -e '
      const fs = require("fs"), path = require("path");
      const root = process.argv[1];
      const s = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
      const bad = [];
      for (const arr of Object.values(s.hooks || {})) {
        for (const g of arr) {
          for (const h of (g.hooks || [g])) {
            if (h.type !== "command" || !h.command) continue;
            const m = h.command.match(/\.claude\/hooks\/[A-Za-z0-9._-]+/);
            if (!m) continue;
            const p = path.join(root, m[0]);
            if (!fs.existsSync(p)) { bad.push(m[0] + " MISSING"); continue; }
            if (!(fs.statSync(p).mode & 0o100)) bad.push(m[0] + " NOT-EXECUTABLE");
          }
        }
      }
      if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
    ' "$TREE"
    [ "$status" -eq 0 ]
}

@test "--refresh over the delivered tree stays symlink-free and keeps lib loadable" {
    run bash "$SCAFFOLD" "$TREE" --refresh --plugin-dir "$PLUGIN_DIR"
    [ "$status" -eq 0 ]
    run find "$TREE/.claude" -type l
    [ -z "$output" ]
    run node -e 'require(process.argv[1])' "$TREE/.claude/lib/trd-parser.js"
    [ "$status" -eq 0 ]
}

@test "a fresh scaffold arrives with publishArtifacts ON" {
    run node -e '
      const d = require(process.argv[1] + "/.claude/settings.json");
      process.exit(d.ensemble.publishArtifacts === true ? 0 : 1);
    ' "$TREE"
    [ "$status" -eq 0 ]
}

@test "an owner who turns publishArtifacts OFF keeps it off across refreshes" {
    # The behavioural half of the setdefault grep in notify-on-complete.test.sh.
    # Publishing sends documents to an external service; an owner who declined
    # that has made a decision, and no upgrade may quietly reverse it. Two
    # refreshes, because a bug that re-adds the key would plausibly do it on the
    # pass that first notices it missing.
    local off
    off="$(mktemp -d)"
    git -C "$off" init -q .
    git -C "$off" commit -q --allow-empty -m init
    bash "$SCAFFOLD" "$off" --plugin-dir "$PLUGIN_DIR" >/dev/null 2>&1

    node -e '
      const fs = require("fs"), p = process.argv[1] + "/.claude/settings.json";
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      d.ensemble.publishArtifacts = false;
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
    ' "$off"

    bash "$SCAFFOLD" "$off" --refresh --plugin-dir "$PLUGIN_DIR" >/dev/null 2>&1
    bash "$SCAFFOLD" "$off" --refresh --plugin-dir "$PLUGIN_DIR" >/dev/null 2>&1

    run node -e '
      const d = require(process.argv[1] + "/.claude/settings.json");
      process.exit(d.ensemble.publishArtifacts === false ? 0 : 1);
    ' "$off"
    local rc="$status"
    rm -rf "$off"
    [ "$rc" -eq 0 ]
}
