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

# --- generate-shipped-hashes.sh (RBE-P002) ------------------------------------

_gen_setup() {
    GEN="$SCRIPT_DIR/generate-shipped-hashes.sh"
    REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
    LIST="$SCRIPT_DIR/../templates/shipped-hashes.json"
    FIX="$REPO_ROOT/test/fixtures/rebase-engine/older"
    # Not under /tmp: the render copies skill folders that carry the setgid bit.
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
}

# _list_edit <out> <python statement over d>: a copy of the committed list, edited.
_list_edit() {
    python3 - "$LIST" "$1" "$2" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
exec(sys.argv[3])
json.dump(d, open(sys.argv[2], "w"), indent=2, sort_keys=True)
PY
}

_blob() { git hash-object "$1"; }

# A full throwaway repo: commit 1 tagged v0.0.1, commit 2 (HEAD) untagged.
_make_repo() {
    R="$TEST_DIR/repo"
    git init -q "$R"
    git -C "$R" commit -q --allow-empty -m one
    git -C "$R" tag v0.0.1
    git -C "$R" commit -q --allow-empty -m two
}

@test "generate: unknown argument and no mode both exit 1" {
    _gen_setup
    run "$GEN" --bogus
    [ "$status" -eq 1 ]
    run "$GEN"
    [ "$status" -eq 1 ]
}

@test "generate --check: exits 0 on the committed files" {
    _gen_setup
    run "$GEN" --check
    [ "$status" -eq 0 ]
    [[ "$output" == *"structure: ok"* ]]
    [[ "$output" == *"coverage: ok"* ]]
    [[ "$output" == *"history: "* ]]
}

@test "generate --check: a --depth 1 clone skips only the history part" {
    _gen_setup
    git clone -q --depth 1 "file://$REPO_ROOT" "$TEST_DIR/shallow"
    run "$GEN" --check --repo "$TEST_DIR/shallow"
    [ "$status" -eq 0 ]
    [[ "$output" == *"structure: ok"* ]]
    [[ "$output" == *"coverage: ok"* ]]
    [[ "$output" == *"history: skipped (shallow clone)"* ]]
}

@test "generate --check: history is checked on a full repo and fails naming the missing tag" {
    _gen_setup
    _make_repo
    _list_edit "$TEST_DIR/l.json" 'd["tags"] = ["v0.0.1"]'
    run "$GEN" --check --repo "$R" --list "$TEST_DIR/l.json"
    [ "$status" -eq 0 ]
    [[ "$output" == *"history: checked"* ]]
    git -C "$R" tag v0.0.2 HEAD~1
    run "$GEN" --check --repo "$R" --list "$TEST_DIR/l.json"
    [ "$status" -eq 1 ]
    [[ "$output" == *"v0.0.2"* ]]
    git clone -q --depth 1 "file://$R" "$TEST_DIR/repo-shallow"
    run "$GEN" --check --repo "$TEST_DIR/repo-shallow" --list "$TEST_DIR/l.json"
    [ "$status" -eq 0 ]
    [[ "$output" == *"history: skipped (shallow clone)"* ]]
}

@test "generate --check: a tag on HEAD itself is not required in the list" {
    _gen_setup
    _make_repo
    git -C "$R" tag v0.0.2
    _list_edit "$TEST_DIR/l.json" 'd["tags"] = ["v0.0.1"]'
    run "$GEN" --check --repo "$R" --list "$TEST_DIR/l.json"
    [ "$status" -eq 0 ]
    [[ "$output" == *"history: checked"* ]]
}

@test "generate --check: fails naming a listed path no render ships and no retired entry covers" {
    _gen_setup
    _list_edit "$TEST_DIR/l.json" 'd["files"]["commands/ghost-command.md"] = ["'"$(printf 'a%.0s' $(seq 40))"'"]; d["files"] = dict(sorted(d["files"].items()))'
    run "$GEN" --check --list "$TEST_DIR/l.json"
    [ "$status" -eq 1 ]
    [[ "$output" == *"commands/ghost-command.md"* ]]
}

@test "generate --check: a retired entry covers a listed path no render ships" {
    _gen_setup
    # hooks/async-discipline.js is a retired file entry: listing it is covered.
    _list_edit "$TEST_DIR/l.json" 'h = ["'"$(printf 'b%.0s' $(seq 40))"'"]; d["files"]["hooks/async-discipline.js"] = h; d["files"] = dict(sorted(d["files"].items()))'
    run "$GEN" --check --list "$TEST_DIR/l.json"
    [ "$status" -eq 0 ]
}

@test "generate --check: fails on a hash that is not 40-hex" {
    _gen_setup
    _list_edit "$TEST_DIR/l.json" 'k = sorted(d["files"])[0]; d["files"][k] = ["not-a-hash"]'
    run "$GEN" --check --list "$TEST_DIR/l.json"
    [ "$status" -eq 1 ]
    [[ "$output" == *"40"* ]]
}

@test "generate --check: fails on unsorted tags and on a path with .." {
    _gen_setup
    _list_edit "$TEST_DIR/l.json" 'd["tags"].reverse()'
    run "$GEN" --check --list "$TEST_DIR/l.json"
    [ "$status" -eq 1 ]
    _list_edit "$TEST_DIR/l2.json" 'd["files"]["commands/../x"] = ["'"$(printf 'c%.0s' $(seq 40))"'"]; d["files"] = dict(sorted(d["files"].items()))'
    run "$GEN" --check --list "$TEST_DIR/l2.json"
    [ "$status" -eq 1 ]
    [[ "$output" == *"commands/../x"* ]]
}

@test "shipped-hashes: tags hold every v* release from v4.2.0" {
    _gen_setup
    run python3 - "$LIST" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))["tags"]
assert t[0] == "v4.2.0", t[0]
assert len(t) >= 48 and "v4.17.10" in t, len(t)
PY
    [ "$status" -eq 0 ]
}

@test "shipped-hashes: the older fixtures are listed and differ from the current plugin" {
    _gen_setup
    cmd_blob="$(_blob "$FIX/commands/plan.md")"
    cur_cmd="$(_blob "$PLUGIN/commands/core/plan.md")"
    [ "$cmd_blob" != "$cur_cmd" ]
    agent_hash="$(_normhash "$FIX/agents" | awk -F'\t' '$1=="backend-implementer"{print $2}')"
    cur_agent="$(_normhash "$PLUGIN/agents-lib" | awk -F'\t' '$1=="backend-implementer"{print $2}')"
    [ -n "$agent_hash" ]
    [ "$agent_hash" != "$cur_agent" ]
    run python3 - "$LIST" "$FIX/stop-prompt.txt" "$PLUGIN/templates/claude-directory/settings.json" \
        "$cmd_blob" "$agent_hash" "$cur_cmd" "$cur_agent" <<'PY'
import hashlib, json, sys
lst, prompt_file, tmpl, cmd, agent, cur_cmd, cur_agent = sys.argv[1:]
d = json.load(open(lst))
assert cmd in d["files"]["commands/plan.md"]
assert agent in d["files"]["agents/backend-implementer.md"]
blob = lambda b: hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()
old = open(prompt_file, encoding="utf-8", newline="").read()
assert blob(old.encode()) in d["promptHooks"]
cur = [h["prompt"] for g in json.load(open(tmpl))["hooks"].values() for e in g for h in e["hooks"] if h.get("type") == "prompt"]
assert len(cur) == 1 and cur[0] != old and blob(cur[0].encode()) in d["promptHooks"]
PY
    [ "$status" -eq 0 ]
}

@test "generate --append: re-listing a tag is byte-identical and a live render yields the fixture hashes" {
    _gen_setup
    if [ "$(git -C "$REPO_ROOT" rev-parse --is-shallow-repository)" = "true" ] \
        || ! git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$(cat "$FIX/TAG")" >/dev/null; then
        skip "no tags here (shallow clone)"
    fi
    tag="$(cat "$FIX/TAG")"
    cp "$LIST" "$TEST_DIR/l.json"
    run "$GEN" --append "$tag" --list "$TEST_DIR/l.json"
    [ "$status" -eq 0 ]
    cmp "$LIST" "$TEST_DIR/l.json"
    # Built from nothing, the append holds exactly what that tag's render yields.
    run "$GEN" --append "$tag" --list "$TEST_DIR/new.json"
    [ "$status" -eq 0 ]
    run python3 - "$TEST_DIR/new.json" "$FIX" "$(_blob "$FIX/commands/plan.md")" \
        "$(_normhash "$FIX/agents" | awk -F'\t' '$1=="backend-implementer"{print $2}')" <<'PY'
import hashlib, json, sys
d = json.load(open(sys.argv[1]))
assert d["tags"] == [open(sys.argv[2] + "/TAG").read().strip()]
assert d["files"]["commands/plan.md"] == [sys.argv[3]]
assert d["files"]["agents/backend-implementer.md"] == [sys.argv[4]]
old = open(sys.argv[2] + "/stop-prompt.txt", encoding="utf-8", newline="").read().encode()
assert hashlib.sha1(b"blob %d\0" % len(old) + old).hexdigest() in d["promptHooks"]
PY
    [ "$status" -eq 0 ]
}

@test "generate --append: an unknown tag exits 1 and writes nothing" {
    _gen_setup
    run "$GEN" --append v9.9.9 --list "$TEST_DIR/none.json"
    [ "$status" -eq 1 ]
    [ ! -e "$TEST_DIR/none.json" ]
}
