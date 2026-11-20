#!/usr/bin/env bats
#
# rebase-engine.test.sh - BATS tests for the --rebase mode of scaffold-project.sh
# (docs/TRD/deterministic-rebase-engine.md). RBE-B001 covers flag parsing, the
# render, authored_rules, normhash and inject's exclude list.

setup() {
    SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
    SCAFFOLD="$SCRIPT_DIR/scaffold-project.sh"
    PLUGIN="$(cd "$SCRIPT_DIR/../../full" && pwd)"
    TEST_DIR="$(mktemp -d)"
    TARGET="$TEST_DIR/target"
    mkdir -p "$TARGET"
}

teardown() {
    rm -rf "$TEST_DIR"
}

# A scaffolded target with jest installed and a stack.md naming pytest.
_make_target() {
    mkdir -p "$TARGET/.claude/skills"
    printf 'jest\nfrontend-design\n' > "$TARGET/.claude/selected-skills.txt"
    "$SCAFFOLD" --plugin-dir "$PLUGIN" --copy-skills "$TARGET" >/dev/null 2>&1
    printf '# Stack\n- pytest\n' > "$TARGET/.claude/rules/stack.md"
}

_tree_hashes() {
    (cd "$1" && find . -type f -o -type l | sort | while read -r f; do
        printf '%s %s\n' "$f" "$(shasum "$f" 2>/dev/null | cut -d' ' -f1)"
    done)
}

# --- flag parsing ---------------------------------------------------------

@test "rebase: --dry-run without --rebase exits 1" {
    run "$SCAFFOLD" --dry-run "$TARGET"
    [ "$status" -eq 1 ]
    [[ "$output" == *"--dry-run"* ]]
}

@test "rebase: --preserve-all without --rebase exits 1" {
    run "$SCAFFOLD" --preserve-all "$TARGET"
    [ "$status" -eq 1 ]
    [[ "$output" == *"--preserve-all"* ]]
}

@test "rebase: rejected combinations exit 1" {
    local flag
    for flag in --refresh --force --copy-skills --agent-status --sync-agents \
                --stamp-version --git-files --records-cutover --no-push --new-only; do
        run "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$flag" "$TARGET"
        [ "$status" -eq 1 ] || { echo "accepted: $flag"; return 1; }
    done
}

@test "rebase: the earlier strict modes reject --rebase too" {
    local flag
    for flag in --stamp-version --git-files --records-cutover; do
        run "$SCAFFOLD" "$flag" --rebase --plugin-dir "$PLUGIN" "$TARGET"
        [ "$status" -eq 1 ] || { echo "accepted: $flag"; return 1; }
    done
}

@test "rebase: missing --plugin-dir exits 1" {
    run "$SCAFFOLD" --rebase "$TARGET"
    [ "$status" -eq 1 ]
    [[ "$output" == *"--plugin-dir"* ]]
}

# --- authored_rules ---------------------------------------------------------

@test "authored_rules prints the six owner-governed names" {
    run bash -c "set --; source '$SCAFFOLD'; authored_rules"
    [ "$status" -eq 0 ]
    [ "$output" = "$(printf 'constitution.md\nstack.md\nprocess.md\nverification.md\ndesign.md\nship.md')" ]
}

@test "authored_rules: the array line appears exactly once in the script" {
    [ "$(grep -c 'AUTHORED_RULES=(' "$SCAFFOLD")" -eq 1 ]
    grep -q '^    local AUTHORED_RULES=("constitution.md" "stack.md" "process.md" "verification.md" "design.md" "ship.md")$' "$SCAFFOLD"
}

# --- render -----------------------------------------------------------------

_render() {
    # $1 plugin dir, $2 render dir
    bash -c "set --; source '$SCAFFOLD'; PLUGIN_DIR='$1'; render_plugin_tree '$TARGET' '$2'" >/dev/null 2>&1
}

@test "render: holds the shipped content, the installed skills, no symlink, no owner rules" {
    _make_target
    mkdir -p "$TEST_DIR/r"
    _render "$PLUGIN" "$TEST_DIR/r"
    R="$TEST_DIR/r/.claude"
    [ -f "$R/skills/jest/SKILL.md" ]
    [ ! -d "$R/skills/pytest" ]
    while read -r name _; do
        [[ -z "$name" || "$name" == \#* ]] && continue
        [ -d "$R/skills/$name" ] || { echo "missing framework skill $name"; return 1; }
    done < "$SCRIPT_DIR/../../skills/framework-skills.txt"
    [ -z "$(find "$R" -type l)" ]
    [ ! -f "$R/commands/init-project.md" ]
    [ ! -f "$R/commands/rebase-project.md" ]
    [ -n "$(ls "$R/commands"/*.md)" ]
    [ -n "$(ls "$R/agents"/*.md)" ]
    [ -n "$(find "$R/hooks" -maxdepth 1 -type f)" ]
    local rule
    for rule in constitution.md stack.md process.md verification.md design.md ship.md; do
        [ ! -f "$R/rules/$rule" ]
    done
}

@test "render: a relative --plugin-dir renders the same file list as the absolute one" {
    _make_target
    ( cd "$SCRIPT_DIR/../.." && "$SCAFFOLD" --rebase --plugin-dir full "$TARGET" ) >"$TEST_DIR/rel.out" 2>/dev/null
    run "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET"
    [ "$status" -eq 0 ]
    abs_count="$(echo "$output" | grep '^RENDERED_FILES' | cut -d' ' -f2)"
    rel_count="$(grep '^RENDERED_FILES' "$TEST_DIR/rel.out" | cut -d' ' -f2)"
    [ -n "$abs_count" ]
    [ "$abs_count" -gt 100 ]
    [ "$abs_count" = "$rel_count" ]
}

@test "render: a cache-shaped plugin (symlinks resolved) renders the same file list" {
    _make_target
    cp -RL "$PLUGIN" "$TEST_DIR/cache"
    mkdir -p "$TEST_DIR/r1" "$TEST_DIR/r2"
    _render "$PLUGIN" "$TEST_DIR/r1"
    _render "$TEST_DIR/cache" "$TEST_DIR/r2"
    diff <(cd "$TEST_DIR/r1/.claude" && find . -type f | sort) \
         <(cd "$TEST_DIR/r2/.claude" && find . -type f | sort)
}

@test "render: leaves the target's file list and hashes unchanged" {
    _make_target
    _tree_hashes "$TARGET" > "$TEST_DIR/before"
    mkdir -p "$TEST_DIR/r"
    _render "$PLUGIN" "$TEST_DIR/r"
    _tree_hashes "$TARGET" > "$TEST_DIR/after"
    diff "$TEST_DIR/before" "$TEST_DIR/after"
}

@test "render: fails when the plugin is empty" {
    _make_target
    mkdir -p "$TEST_DIR/empty" "$TEST_DIR/r"
    run bash -c "set --; source '$SCAFFOLD'; PLUGIN_DIR='$TEST_DIR/empty'; render_plugin_tree '$TARGET' '$TEST_DIR/r'"
    [ "$status" -ne 0 ]
}

# --- normhash and the exclude list --------------------------------------------

_inject() {
    # $1 target, rest: exclude names
    local t="$1"; shift
    bash -c 'plugin="$1"; src="$2"; t="$3"; shift 3; ex=("$@"); set --; source "$src"; PLUGIN_DIR="$plugin"; inject_agent_skills "$t" ${ex[@]+"${ex[@]}"}' _ "$PLUGIN" "$SCAFFOLD" "$t" "$@" >/dev/null 2>&1
}

_normhash() {
    bash -c "set --; source '$SCAFFOLD'; agent_normhash '$1'"
}

@test "normhash: unchanged by inject, changed by a body edit" {
    _make_target
    A="$TARGET/.claude/agents"
    _normhash "$A" > "$TEST_DIR/h1"
    [ -s "$TEST_DIR/h1" ]
    _inject "$TARGET"
    _normhash "$A" > "$TEST_DIR/h2"
    diff "$TEST_DIR/h1" "$TEST_DIR/h2"
    f="$(ls "$A"/*.md | head -1)"
    printf '\nOne more line of body.\n' >> "$f"
    _normhash "$A" > "$TEST_DIR/h3"
    run diff -q "$TEST_DIR/h1" "$TEST_DIR/h3"
    [ "$status" -ne 0 ]
    [ "$(diff "$TEST_DIR/h1" "$TEST_DIR/h3" | grep -c '^>')" -eq 1 ]
}

@test "normhash: equals git hash-object of the normalised text" {
    mkdir -p "$TEST_DIR/ag"
    printf -- '---\nname: x\n---\nbody\n' > "$TEST_DIR/ag/x.md"
    expected="$(printf -- '---\nname: x\n---\nbody' | git hash-object --stdin)"
    run _normhash "$TEST_DIR/ag"
    [ "$output" = "$(printf 'x\t%s' "$expected")" ]
}

@test "inject exclude list: the excluded agent is untouched, another gains preloads" {
    _make_target
    A="$TARGET/.claude/agents"
    # Strip generated content from two agents, then inject with one excluded.
    python3 - "$A/code-reviewer.md" "$A/backend-implementer.md" <<'PY'
import re, sys
for p in sys.argv[1:]:
    t = open(p).read()
    t = re.sub(r"^skills:\n(?:\s+-\s.*\n)+", "", t, flags=re.M)
    t = re.sub(r"<!-- ENSEMBLE:SKILLS:BEGIN.*?<!-- ENSEMBLE:SKILLS:END -->\n?", "", t, flags=re.S)
    open(p, "w").write(t)
PY
    cp "$A/code-reviewer.md" "$TEST_DIR/cr.before"
    cp "$A/backend-implementer.md" "$TEST_DIR/be.before"
    _inject "$TARGET" code-reviewer
    cmp "$A/code-reviewer.md" "$TEST_DIR/cr.before"
    run cmp -s "$A/backend-implementer.md" "$TEST_DIR/be.before"
    [ "$status" -ne 0 ]
    grep -q "ENSEMBLE:SKILLS:BEGIN" "$A/backend-implementer.md"
}
