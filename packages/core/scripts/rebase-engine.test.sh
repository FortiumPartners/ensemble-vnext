#!/usr/bin/env bats
#
# rebase-engine.test.sh - BATS tests for the --rebase mode of scaffold-project.sh
# (docs/TRD/deterministic-rebase-engine.md). RBE-B001 covers flag parsing, the
# render, authored_rules, normhash and inject's exclude list.

bats_require_minimum_version 1.5.0

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

# Print a Python expression over the last stdout line's JSON, as d.
_res() {
    python3 -c 'import json, sys
line = open(sys.argv[1]).read().splitlines()[-1]
assert line.startswith("REBASE_RESULT "), line
d = json.loads(line[len("REBASE_RESULT "):])
print(eval(sys.argv[2]))' "$1" "$2"
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

@test "render: a relative --plugin-dir gives the same result as the absolute one" {
    _make_target
    ( cd "$SCRIPT_DIR/../.." && "$SCAFFOLD" --rebase --dry-run --plugin-dir full "$TARGET" ) >"$TEST_DIR/rel.out" 2>/dev/null
    "$SCAFFOLD" --rebase --dry-run --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/abs.out" 2>/dev/null
    [ "$(tail -n 1 "$TEST_DIR/abs.out" | cut -c1-14)" = "REBASE_RESULT " ]
    [ "$(_res "$TEST_DIR/abs.out" "sum(c['unchanged'] for c in d['categories'].values())")" -gt 100 ]
    diff "$TEST_DIR/abs.out" "$TEST_DIR/rel.out"
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

# --- files: plan and apply (RBE-B002) ---------------------------------------

FIXTURES="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../../test/fixtures/rebase-engine/older" && pwd)"

# Print "<path> <octal mode>" for every file under $1, sorted.
_modes() {
    python3 -c 'import os, stat, sys
root = sys.argv[1]
for base, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d != ".git"]
    for f in files:
        p = os.path.join(base, f)
        print(os.path.relpath(p, root), oct(stat.S_IMODE(os.lstat(p).st_mode)))' "$1" | sort
}

# A committed target aged into every case the engine classifies.
_aged_target() {
    _make_target
    local c="$TARGET/.claude"
    cp "$FIXTURES/commands/plan.md" "$c/commands/plan.md"                 # older shipped -> replaced
    cp "$FIXTURES/agents/backend-implementer.md" "$c/agents/backend-implementer.md"
    rm "$c/commands/amend.md"                                             # missing -> added
    rm "$c/agents/code-simplifier.md"                                     # missing agent -> added
    printf 'retired\n' > "$c/commands/fix-issue.md"                       # listed retired file
    mkdir -p "$c/hooks/permitter" && printf 'old\n' > "$c/hooks/permitter/a.js"   # retired directory
    printf -- '---\nname: my-agent\n---\n' > "$c/agents/my-agent.md"      # user agent
    mkdir -p "$c/skills/my-skill" && printf 'mine\n' > "$c/skills/my-skill/SKILL.md"
    printf '\nOwner line\n' >> "$c/commands/audit-prd.md"                  # owner-edited command
    printf '\nOwner line\n' >> "$c/agents/code-reviewer.md"                # owner-edited agent
    local r
    for r in constitution process design ship; do printf 'owner %s\n' "$r" > "$c/rules/$r.md"; done
    printf 'DISTINCTIVE-VERIFICATION\n' > "$c/rules/verification.md"
    printf '\nowner tweak\n' >> "$c/rules/autonomy.md"                     # differing framework rule
    ( cd "$TARGET" && git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -q -m fixture )
}

_rules_hash() {
    (cd "$1/.claude/rules" && shasum constitution.md stack.md process.md verification.md design.md ship.md 2>/dev/null)
}

@test "rebase apply: classifies and writes each file case, result is one stdout line" {
    _aged_target
    local c="$TARGET/.claude" before_rules
    before_rules="$(_rules_hash "$TARGET")"
    local owner_cmd owner_agent
    owner_cmd="$(shasum "$c/commands/audit-prd.md")"; owner_agent="$(shasum "$c/agents/code-reviewer.md")"
    mkdir "$TEST_DIR/tmp"
    TMPDIR="$TEST_DIR/tmp" "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/out" 2>/dev/null
    [ "$(grep -c . "$TEST_DIR/out")" -eq 1 ]
    [ -z "$(ls -A "$TEST_DIR/tmp")" ]
    [ "$(_res "$TEST_DIR/out" "sorted(d['categories'])")" = "['agents', 'commands', 'contracts', 'hook-libs', 'hook-prompts', 'hooks', 'libs', 'rules', 'skills', 'workflows']" ]
    [ "$(_res "$TEST_DIR/out" "all(sorted(c) == ['added','conflicts','preserved','removed','replaced','unchanged'] for c in d['categories'].values())")" = "True" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['commands']['added']")" = "['commands/amend.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['commands']['replaced']")" = "['commands/plan.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['agents']['replaced']")" = "['agents/backend-implementer.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['agents']['added']")" = "['agents/code-simplifier.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['commands']['removed']")" = "['commands/fix-issue.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['hooks']['removed']")" = "['hooks/permitter/']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['agents']['preserved']")" = "['agents/my-agent.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['skills']['preserved']")" = "['skills/my-skill']" ]
    [ "$(_res "$TEST_DIR/out" "[x['path'] for x in d['categories']['commands']['conflicts']]")" = "['commands/audit-prd.md']" ]
    [ "$(_res "$TEST_DIR/out" "[x['path'] for x in d['categories']['agents']['conflicts']]")" = "['agents/code-reviewer.md']" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['rules']['conflicts'][0]['path']")" = "rules/autonomy.md" ]
    # Written, removed and left alone, on disk.
    cmp "$c/commands/plan.md" "$SCRIPT_DIR/../commands/plan.md"
    [ -f "$c/commands/amend.md" ]
    [ ! -e "$c/commands/fix-issue.md" ]
    [ ! -e "$c/hooks/permitter" ]
    [ -f "$c/skills/my-skill/SKILL.md" ]
    [ "$(shasum "$c/commands/audit-prd.md")" = "$owner_cmd" ]
    [ "$(shasum "$c/agents/code-reviewer.md")" = "$owner_agent" ]
    [ "$(_rules_hash "$TARGET")" = "$before_rules" ]
    grep -q DISTINCTIVE-VERIFICATION "$c/rules/verification.md"
}

@test "rebase dry-run: same category lists as an apply on an identical copy, writes nothing" {
    _aged_target
    cp -R "$TARGET" "$TEST_DIR/copy"
    _modes "$TARGET" > "$TEST_DIR/modes.before"
    "$SCAFFOLD" --rebase --dry-run --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/dry.out" 2>/dev/null
    "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TEST_DIR/copy" >"$TEST_DIR/apply.out" 2>/dev/null
    [ "$(_res "$TEST_DIR/dry.out" "d['mode']")" = "dry-run" ]
    [ -z "$(cd "$TARGET" && git status --porcelain)" ]
    _modes "$TARGET" > "$TEST_DIR/modes.after"
    diff "$TEST_DIR/modes.before" "$TEST_DIR/modes.after"
    diff <(_res "$TEST_DIR/dry.out" "__import__('json').dumps(d['categories'], sort_keys=True)") \
         <(_res "$TEST_DIR/apply.out" "__import__('json').dumps(d['categories'], sort_keys=True)")
    local cat
    for cat in added replaced removed preserved conflicts; do
        [ "$(_res "$TEST_DIR/dry.out" "sum(len(c['$cat']) for c in d['categories'].values())")" -gt 0 ] || { echo "empty: $cat"; return 1; }
    done
}

# An agent's text without its generated skills: list and block (what the preload step re-derives).
_agent_body() {
    python3 -c 'import re, sys
t = open(sys.argv[1]).read()
t = re.sub(r"^skills:\n(?:\s+-\s.*\n)+", "", t, flags=re.M)
print(re.sub(r"<!-- ENSEMBLE:SKILLS:BEGIN.*?<!-- ENSEMBLE:SKILLS:END -->\n?", "", t, flags=re.S))' "$1" | shasum
}

@test "rebase --preserve-all: replaces the older command, leaves agents, a differing rule and retired files, adds a missing agent" {
    _aged_target
    local c="$TARGET/.claude" before_rules agent_before rule_before
    before_rules="$(_rules_hash "$TARGET")"
    agent_before="$(_agent_body "$c/agents/backend-implementer.md")"
    rule_before="$(shasum "$c/rules/autonomy.md")"
    "$SCAFFOLD" --rebase --preserve-all --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/out" 2>/dev/null
    [ "$(_res "$TEST_DIR/out" "d['preserveAll']")" = "True" ]
    cmp "$c/commands/plan.md" "$SCRIPT_DIR/../commands/plan.md"
    # The preload step re-derives the generated block of an agent that is not a conflict; its body stays.
    [ "$(_agent_body "$c/agents/backend-implementer.md")" = "$agent_before" ]
    [ "$(shasum "$c/rules/autonomy.md")" = "$rule_before" ]
    [ -f "$c/commands/fix-issue.md" ]
    [ -d "$c/hooks/permitter" ]
    [ -f "$c/agents/code-simplifier.md" ]
    [ "$(_rules_hash "$TARGET")" = "$before_rules" ]
    [ "$(_res "$TEST_DIR/out" "sum(len(c['removed']) for c in d['categories'].values())")" = "0" ]
}

@test "rebase apply: a replaced file keeps its mode, added files take their rendered modes, none is 0600" {
    _aged_target
    local c="$TARGET/.claude" hook lib
    chmod 640 "$c/commands/plan.md"
    lib="$(cd "$c/hooks/lib" && find . -maxdepth 1 -type f | head -n 1 | sed 's|^\./||')"
    hook="$(cd "$c/hooks" && find . -maxdepth 1 -type f \( -name '*.js' -o -name '*.sh' \) | head -n 1 | sed 's|^\./||')"
    rm "$c/hooks/lib/$lib" "$c/hooks/$hook"
    "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET" >/dev/null 2>&1
    [ "$(_modes "$TARGET/.claude" | grep -c ' 0o600$')" -eq 0 ]
    _modes "$c" | grep -q "^commands/plan.md 0o640$"
    _modes "$c" | grep -q "^hooks/lib/$lib 0o644$"
    _modes "$c" | grep -q "^hooks/$hook 0o755$"
}

@test "rebase: a retired entry containing .. exits 1 naming it and leaves everything unchanged" {
    _aged_target
    cp -RL "$PLUGIN" "$TEST_DIR/cache"
    mkdir "$TEST_DIR/sentinel" && printf 'keep\n' > "$TEST_DIR/sentinel/file.txt"
    python3 - "$TEST_DIR/cache/templates/retired-files.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["entries"].append({"path": "commands/../../sentinel/file.txt", "category": "commands", "retiredIn": None, "replacedBy": None})
json.dump(d, open(p, "w"))
PY
    _tree_hashes "$TARGET" > "$TEST_DIR/before"
    run "$TEST_DIR/cache/scripts/scaffold-project.sh" --rebase --plugin-dir "$TEST_DIR/cache" "$TARGET"
    [ "$status" -eq 1 ]
    echo "$output" | tail -n 1 > "$TEST_DIR/out"
    [[ "$(_res "$TEST_DIR/out" "d['error']")" == *"commands/../../sentinel/file.txt"* ]]
    _tree_hashes "$TARGET" > "$TEST_DIR/after"
    diff "$TEST_DIR/before" "$TEST_DIR/after"
    [ "$(cat "$TEST_DIR/sentinel/file.txt")" = "keep" ]
}

@test "rebase: a .claude/commands symlinked outside .claude/ exits 1 and writes nothing" {
    _aged_target
    mv "$TARGET/.claude/commands" "$TEST_DIR/outside-commands"
    ln -s "$TEST_DIR/outside-commands" "$TARGET/.claude/commands"
    _tree_hashes "$TEST_DIR/outside-commands" > "$TEST_DIR/before"
    _tree_hashes "$TARGET/.claude" > "$TEST_DIR/before-target"
    run -1 "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET"
    echo "$output" | tail -n 1 > "$TEST_DIR/out"
    [[ "$(_res "$TEST_DIR/out" "d['error']")" == *"commands"* ]]
    _tree_hashes "$TEST_DIR/outside-commands" > "$TEST_DIR/after"
    diff "$TEST_DIR/before" "$TEST_DIR/after"
    _tree_hashes "$TARGET/.claude" > "$TEST_DIR/after-target"
    diff "$TEST_DIR/before-target" "$TEST_DIR/after-target"
}

@test "rebase: an unreadable data file stops the run with an error before any write" {
    _aged_target
    cp -RL "$PLUGIN" "$TEST_DIR/cache"
    printf 'not json' > "$TEST_DIR/cache/templates/shipped-hashes.json"
    _tree_hashes "$TARGET" > "$TEST_DIR/before"
    run "$TEST_DIR/cache/scripts/scaffold-project.sh" --rebase --plugin-dir "$TEST_DIR/cache" "$TARGET"
    [ "$status" -eq 1 ]
    echo "$output" | tail -n 1 > "$TEST_DIR/out"
    [[ "$(_res "$TEST_DIR/out" "d['error']")" == *"shipped-hashes.json"* ]]
    _tree_hashes "$TARGET" > "$TEST_DIR/after"
    diff "$TEST_DIR/before" "$TEST_DIR/after"
}

# --- settings: merge, conflicts, guard, preserve-all (RBE-B003) --------------

S="settings.json"

# Edit the target's settings.json: $1 is Python over the dict d.
_edit() {
    python3 - "$TARGET/.claude/$S" "$1" <<'PY'
import collections, json, sys
d = json.load(open(sys.argv[1]), object_pairs_hook=collections.OrderedDict)
exec(sys.argv[2])
open(sys.argv[1], "w").write(json.dumps(d, indent=2) + "\n")
PY
}

# Print a Python expression over the target's settings.json as d, timestamps removed (D12).
_sget() {
    python3 - "$TARGET/.claude/$S" "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for k in ("refreshed_at", "rebased_at"):
    d.get("ensemble", {}).pop(k, None)
print(eval(sys.argv[2]))
PY
}

# Every registration in the target, as "<event> <command-or-prompt>".
_regs() {
    _sget "'\\n'.join(ev + ' ' + (h.get('command') or h.get('prompt') or '') for ev, gs in d['hooks'].items() for g in gs for h in g['hooks'])"
}

# Run the engine against $TARGET with the plugin $PLUGIN_UNDER (default $PLUGIN); out in $TEST_DIR/out.
_rebase() {
    local plugin="${PLUGIN_UNDER:-$PLUGIN}"
    "$plugin/scripts/scaffold-project.sh" --rebase --plugin-dir "$plugin" "$@" "$TARGET" >"$TEST_DIR/out" 2>/dev/null
}

# The guard mode on two settings files; prints its output, returns its status.
_guard() {
    python3 -c "$(bash -c "set --; source '$SCAFFOLD'; rebase_engine_program")" guard "$1" "$2"
}

_plugin_settings() { echo "$SCRIPT_DIR/../templates/claude-directory/settings.json"; }

@test "settings merge: user registrations are carried once each on their own events, after the plugin's groups" {
    _make_target
    _edit "d['hooks']['PostToolUse'].append({'matcher': 'Bash', 'hooks': [{'type': 'command', 'command': 'my-linter --check'}]})
d['hooks'].setdefault('PreToolUse', []).append({'hooks': [{'type': 'command', 'command': 'bash scripts/formatter.sh'}]})"
    _rebase
    _rebase
    [ "$(_regs | grep -c '^PostToolUse my-linter --check$')" -eq 1 ]
    [ "$(_regs | grep -c '^PreToolUse bash scripts/formatter.sh$')" -eq 1 ]
    [ "$(_sget "d['hooks']['PostToolUse'][-1]['hooks'][0]['command']")" = "my-linter --check" ]
    [ "$(_sget "d['hooks']['PostToolUse'][-1]['matcher']")" = "Bash" ]
}

@test "settings merge: a manifest hook on a wrong event and a retired hook are dropped" {
    _make_target
    _edit "d['hooks']['Notification'] = [{'hooks': [{'type': 'command', 'command': 'bash -c \'cd \"\$X\" && .claude/hooks/status.js\''}, {'type': 'command', 'command': '.claude/hooks/learning.sh'}]}]
d['hooks']['Stop'].append({'hooks': [{'type': 'command', 'command': '.claude/hooks/permitter/x.js'}]})"
    _rebase
    [ "$(_sget "'Notification' in d['hooks']")" = "False" ]
    [ "$(_regs | grep -c 'learning.sh')" -eq 0 ]
    [ "$(_regs | grep -c 'permitter')" -eq 0 ]
    [ "$(_regs | grep -c 'hooks/status.js')" -eq 1 ]   # only the plugin's own, on SubagentStop
    _regs | grep 'hooks/status.js' | grep -q '^SubagentStop '
    [ "$(_res "$TEST_DIR/out" "len(d['settings']['removed'])")" -eq 3 ]
}

@test "settings merge: the old Stop prompt is dropped and the plugin's prompt appears exactly once" {
    _make_target
    python3 - "$TARGET/.claude/$S" "$FIXTURES/stop-prompt.txt" <<'PY'
import collections, json, sys
d = json.load(open(sys.argv[1]), object_pairs_hook=collections.OrderedDict)
old = open(sys.argv[2], encoding="utf-8", newline="").read()
d["hooks"]["Stop"].insert(0, {"hooks": [{"type": "prompt", "prompt": old}]})
open(sys.argv[1], "w").write(json.dumps(d, indent=2) + "\n")
PY
    _rebase
    [ "$(_sget "sum(h['type'] == 'prompt' for gs in d['hooks'].values() for g in gs for h in g['hooks'])")" -eq 1 ]
    [ "$(_sget "[h['prompt'] for g in d['hooks']['Stop'] for h in g['hooks'] if h['type'] == 'prompt'][0] == $(python3 -c "import json;print(json.load(open('$(_plugin_settings)'))['hooks']['Stop'][0]['hooks'][0]['prompt'].__repr__())")")" = "True" ]
}

@test "settings merge: with promptHooks emptied the current prompt still appears exactly once after two applies" {
    _make_target
    cp -RL "$PLUGIN" "$TEST_DIR/cache"
    python3 - "$TEST_DIR/cache/templates/shipped-hashes.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["promptHooks"] = []
json.dump(d, open(sys.argv[1], "w"))
PY
    PLUGIN_UNDER="$TEST_DIR/cache" _rebase
    PLUGIN_UNDER="$TEST_DIR/cache" _rebase
    [ "$(_sget "sum(h['type'] == 'prompt' for gs in d['hooks'].values() for g in gs for h in g['hooks'])")" -eq 1 ]
}

@test "settings merge: local env and ensemble.openPullRequest survive; removed plugin keys are added back" {
    _make_target
    _edit "d['env']['MY_VAR'] = 'mine'
d['env']['CLAUDE_CODE_STOP_HOOK_BLOCK_CAP'] = '7'
d['ensemble']['openPullRequest'] = 'auto'
del d['\$schema']
del d['permissions']['allow']"
    _rebase
    [ "$(_sget "d['env']['MY_VAR']")" = "mine" ]
    [ "$(_sget "d['env']['CLAUDE_CODE_STOP_HOOK_BLOCK_CAP']")" = "7" ]
    [ "$(_sget "d['ensemble']['openPullRequest']")" = "auto" ]
    [ "$(_sget "d['\$schema'].startswith('https://')")" = "True" ]
    [ "$(_sget "len(d['permissions']['allow']) > 5")" = "True" ]
    [ "$(_res "$TEST_DIR/out" "sorted(d['settings']['added'])")" = "['\$schema', 'permissions.allow']" ]
}

@test "settings conflict: hooks set to a list writes nothing; a valid hooks with a user registration is written" {
    _make_target
    _edit "d['hooks'] = ['not', 'an', 'object']
del d['\$schema']"
    cp "$TARGET/.claude/$S" "$TEST_DIR/before.json"
    _rebase
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "False" ]
    [ "$(_res "$TEST_DIR/out" "d['settings']['conflicts'][0]['path']")" = "hooks" ]
    # The stamp still runs and writes its own keys; the conflicted hooks value and the removed key stay as they were.
    [ "$(_sget "d['hooks']")" = "['not', 'an', 'object']" ]
    [ "$(_sget "'\$schema' in d")" = "False" ]
    _edit "d['hooks'] = {'PostToolUse': [{'hooks': [{'type': 'command', 'command': 'my-tool'}]}]}"
    _rebase
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "True" ]
    [ "$(_regs | grep -c '^PostToolUse my-tool$')" -eq 1 ]
    [ "$(_sget "'\$schema' in d")" = "True" ]
}

@test "settings conflict: a string where the plugin has an object keeps the local value while another change is written" {
    _make_target
    _edit "d['permissions'] = 'locked'
del d['\$schema']"
    _rebase
    [ "$(_sget "d['permissions']")" = "locked" ]
    [ "$(_res "$TEST_DIR/out" "d['settings']['conflicts'][0]['path']")" = "permissions" ]
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "True" ]
    [ "$(_sget "'\$schema' in d")" = "True" ]
}

@test "guard: exits 1 naming both counts when a registration or the prompt entry is missing, 0 otherwise" {
    local plugin
    plugin="$(_plugin_settings)"
    python3 - "$plugin" "$TEST_DIR" <<'PY'
import copy, json, sys
p = json.load(open(sys.argv[1]))
out = sys.argv[2]
def save(name, d): json.dump(d, open("%s/%s.json" % (out, name), "w"))
a = copy.deepcopy(p); a["hooks"]["UserPromptSubmit"][0]["hooks"].pop(); save("fewer", a)
b = copy.deepcopy(p)
b["hooks"]["Stop"][0]["hooks"][0] = {"type": "command", "command": "x"}; save("noprompt", b)
c = copy.deepcopy(p); c["hooks"]["PostToolUse"].append({"hooks": [{"type": "command", "command": "mine"}]}); save("plus", c)
PY
    run _guard "$plugin" "$TEST_DIR/fewer.json"
    [ "$status" -eq 1 ]
    [[ "$output" == *"plugin: 10 registrations, 1 prompt; merged: 9 registrations, 1 prompt"* ]]
    run _guard "$plugin" "$TEST_DIR/noprompt.json"
    [ "$status" -eq 1 ]
    [[ "$output" == *"merged: 10 registrations, 0 prompt"* ]]
    run _guard "$plugin" "$plugin"
    [ "$status" -eq 0 ]
    run _guard "$plugin" "$TEST_DIR/plus.json"
    [ "$status" -eq 0 ]
}

@test "settings: a first apply writes, a second writes nothing and the file is equal" {
    _make_target
    _edit "del d['ensemble']['records']"
    _rebase
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "True" ]
    _sget "d" > "$TEST_DIR/first"
    _rebase
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "False" ]
    _sget "d" > "$TEST_DIR/second"
    cmp "$TEST_DIR/first" "$TEST_DIR/second"
}

@test "settings: dry-run reports the same settings lists as an apply and writes nothing" {
    _make_target
    _edit "del d['ensemble']['records']"
    cp -R "$TARGET" "$TEST_DIR/copy"
    cp "$TARGET/.claude/$S" "$TEST_DIR/before.json"
    "$SCAFFOLD" --rebase --dry-run --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/dry.out" 2>/dev/null
    "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TEST_DIR/copy" >"$TEST_DIR/apply.out" 2>/dev/null
    cmp "$TARGET/.claude/$S" "$TEST_DIR/before.json"
    diff <(_res "$TEST_DIR/dry.out" "d['settings']") <(_res "$TEST_DIR/apply.out" "d['settings']")
    [ "$(_res "$TEST_DIR/dry.out" "d['settings']['written']")" = "True" ]
}

@test "settings --preserve-all: old prompt and retired registration dropped, top-level key added, nested keys and env untouched" {
    _make_target
    python3 - "$TARGET/.claude/$S" "$FIXTURES/stop-prompt.txt" <<'PY'
import collections, json, sys
d = json.load(open(sys.argv[1]), object_pairs_hook=collections.OrderedDict)
old = open(sys.argv[2], encoding="utf-8", newline="").read()
d["hooks"]["Stop"].insert(0, {"hooks": [{"type": "prompt", "prompt": old}]})
d["hooks"]["Stop"].append({"hooks": [{"type": "command", "command": ".claude/hooks/learning.sh"}]})
del d["$schema"]
del d["permissions"]["allow"]
d["env"] = {"MY_VAR": "mine"}
del d["ensemble"]["records"]
open(sys.argv[1], "w").write(json.dumps(d, indent=2) + "\n")
PY
    _rebase --preserve-all
    [ "$(_sget "sum(h['type'] == 'prompt' for gs in d['hooks'].values() for g in gs for h in g['hooks'])")" -eq 1 ]
    [ "$(_regs | grep -c 'learning.sh')" -eq 0 ]
    [ "$(_sget "'\$schema' in d")" = "True" ]
    [ "$(_sget "d['permissions']")" = "{}" ]
    [ "$(_sget "d['env']['MY_VAR']")" = "mine" ]
    # ensemble.records is backfilled by the stamp when absent, so it is not asserted absent here.
}

@test "settings: no settings.json writes the plugin default with every key in added" {
    _make_target
    rm "$TARGET/.claude/$S"
    _rebase
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "True" ]
    [ "$(_res "$TEST_DIR/out" "sorted(d['settings']['added']) == sorted(__import__('json').load(open('$(_plugin_settings)')))")" = "True" ]
    # The stamp then adds its own ensemble keys; everything else is the plugin default.
    [ "$(_sget "{k: v for k, v in d.items() if k != 'ensemble'} == {k: v for k, v in __import__('json').load(open('$(_plugin_settings)')).items() if k != 'ensemble'}")" = "True" ]
}

@test "settings: a settings.json that is not JSON is a conflict and its bytes are unchanged" {
    _make_target
    printf '{ not json' > "$TARGET/.claude/$S"
    cp "$TARGET/.claude/$S" "$TEST_DIR/before.json"
    _rebase
    [ "$(_res "$TEST_DIR/out" "d['settings']['conflicts'][0]['path']")" = "settings.json" ]
    [ "$(_res "$TEST_DIR/out" "d['settings']['written']")" = "False" ]
    cmp "$TARGET/.claude/$S" "$TEST_DIR/before.json"
}

@test "settings: the program has one settings-write function and it calls the guard check first" {
    # One definition writes settings.json (os.replace onto the settings path), and the guard runs in it first.
    [ "$(grep -c 'os.replace(tmp, entry\["path"\])' "$SCAFFOLD")" -eq 1 ]
    python3 - "$SCAFFOLD" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
body = src[src.index("def write_settings("):]
body = body[:body.index("\ndef ", 10)]
assert body.index("guard_check(") < body.index("os.replace("), body
PY
}

# The guard cannot be tripped end to end through --rebase with a real input: the merged hooks block
# is the plugin's groups deep-copied plus the owner's, so its counts never fall below the plugin's
# (D12 rejected a test-only switch to force it). So this drives the two real stages that report a
# refusal, in the order --rebase runs them: apply on a plan whose merged block is one registration
# short, then the post steps on the result apply printed.
@test "settings guard refusal: apply reports written false and refused, bytes unchanged, stamp skipped" {
    _make_target
    local c="$TARGET/.claude" plugin
    plugin="$(_plugin_settings)"
    python3 - "$c/settings.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.setdefault("ensemble", {})["version"] = "4.15.0"
json.dump(d, open(p, "w"), indent=2)
PY
    cp "$c/settings.json" "$TEST_DIR/settings.before"
    python3 - "$plugin" "$c" "$TEST_DIR" <<'PY'
import copy, json, os, sys
plugin, claude, out = sys.argv[1:4]
short = json.load(open(plugin))
short["hooks"]["UserPromptSubmit"][0]["hooks"].pop()
empty = lambda: {"added": [], "replaced": [], "removed": [], "preserved": [], "conflicts": [], "unchanged": 0}
res = {"mode": "apply", "categories": {"agents": empty()},
       "settings": dict(empty(), written=True, refused=None, counts=None),
       "steps": {}}
plan = {"claude": claude, "claudeReal": os.path.realpath(claude), "authored": [], "actions": [],
        "result": res,
        "settings": {"path": os.path.join(claude, "settings.json"), "pluginPath": plugin,
                     "content": json.dumps(short, indent=2) + "\n", "mode": 0o644}}
json.dump(plan, open(out + "/plan.json", "w"))
PY
    python3 -c "$(bash -c "set --; source '$SCAFFOLD'; rebase_engine_program")" apply "$TEST_DIR/plan.json" > "$TEST_DIR/applied.json"
    { printf 'REBASE_RESULT '; cat "$TEST_DIR/applied.json"; } > "$TEST_DIR/applied"
    # settings.json is untouched and the result says why.
    cmp "$c/settings.json" "$TEST_DIR/settings.before"
    [ -z "$(find "$c" -maxdepth 1 -name '*.tmp')" ]
    [ "$(_res "$TEST_DIR/applied" "d['settings']['written']")" = "False" ]
    # The counts are read from the plugin file, as the guard reads them (D12): merged is one registration short.
    local want
    want="$(python3 -c 'import json, sys
hooks = json.load(open(sys.argv[1]))["hooks"]
regs = [h for groups in hooks.values() for g in groups for h in g["hooks"]]
n, p = len(regs), sum(h.get("type") == "prompt" for h in regs)
print("plugin: %d registrations, %d prompt; merged: %d registrations, %d prompt" % (n, p, n - 1, p))' "$plugin")"
    [ "$(_res "$TEST_DIR/applied" "d['settings']['refused']")" = "$want" ]

    # The post steps read that result: the stamp is skipped with the guard's reason, others still run.
    local after
    after="$(bash -c 'scaffold="$1" plugin="$2" target="$3" res="$4"; set --; source "$scaffold"; PLUGIN_DIR="$plugin"
        m="$(find_plugin_json hooks hooks.manifest.json)"
        rebase_post_steps "$target" "$m" "$(cat "$res")" 2>/dev/null' _ "$SCAFFOLD" "$PLUGIN" "$TARGET" "$TEST_DIR/applied.json")"
    printf 'REBASE_RESULT %s\n' "$after" > "$TEST_DIR/final"
    [ "$(_res "$TEST_DIR/final" "d['steps']['stamp']")" = "skipped: settings write refused by the guard" ]
    [ "$(_res "$TEST_DIR/final" "d['steps']['modes']")" = "ok" ]
    # ensemble.version was not stamped.
    [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ensemble"]["version"])' "$c/settings.json")" = "4.15.0" ]
    cmp "$c/settings.json" "$TEST_DIR/settings.before"
}

# --- post-copy steps (RBE-B004) ---------------------------------------------

# Every manifest hook's destination name, one per line.
_manifest_hooks() {
    bash -c 'set --; source "$1"; PLUGIN_DIR="$2"; m="$(find_plugin_json hooks hooks.manifest.json)"; manifest_shippable_hooks "$m" | cut -f1' _ "$SCAFFOLD" "$PLUGIN"
}

# Print settings.json with the two stamp timestamps removed.
_settings_sans_stamp() {
    python3 -c 'import json, sys
d = json.load(open(sys.argv[1]))
for k in ("refreshed_at", "rebased_at"):
    d["ensemble"].pop(k, None)
print(json.dumps(d, sort_keys=True))' "$1/.claude/settings.json"
}

@test "post steps: first apply ages back to a stamped, executable, preloaded tree; a second apply is a no-op" {
    _make_target
    local c="$TARGET/.claude" h a
    # Age the target.
    while IFS= read -r h; do [[ -f "$c/hooks/$h" ]] && chmod -x "$c/hooks/$h"; done < <(_manifest_hooks)
    python3 - "$c/settings.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.setdefault("ensemble", {})["version"] = "4.15.0"
json.dump(d, open(p, "w"), indent=2)
PY
    for a in "$c"/agents/*.md; do
        python3 - "$a" <<'PY'
import re, sys
p = sys.argv[1]
t = open(p).read()
t = re.sub(r"^skills:\n(?:\s+-\s.*\n)+", "", t, flags=re.M)
t = re.sub(r"<!-- ENSEMBLE:SKILLS:BEGIN.*?<!-- ENSEMBLE:SKILLS:END -->\n?", "", t, flags=re.S)
open(p, "w").write(t)
PY
    done
    printf '\nOwner line\n' >> "$c/agents/code-reviewer.md"
    cp "$c/agents/code-reviewer.md" "$TEST_DIR/cr.before"
    rm "$c/commands/amend.md"
    # Records for the cutover: one in-flight feature and one closed, both tracked (as an aged project has them).
    mkdir -p "$TARGET/.trd-state/live" "$TARGET/.trd-state/done"
    echo '{"branch":"feature/live","tasks":[]}' > "$TARGET/.trd-state/live/implement.json"
    # The closed one records the checked-out branch too, so closed.json (not a branch mismatch) is what skips it.
    echo '{"branch":"feature/live"}' > "$TARGET/.trd-state/done/implement.json"
    echo '{"closed":true}' > "$TARGET/.trd-state/done/closed.json"
    # Identity in the repo's own config: the cutover's seed commits the records ref with plain git
    # (commit-tree), and a CI runner has no global identity to fall back on.
    ( cd "$TARGET" && git init -q -b feature/live && git config user.email a@b && git config user.name t \
        && git add -Af && git commit -q -m fixture )

    "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/out" 2>/dev/null
    [ "$(grep -c . "$TEST_DIR/out")" -eq 1 ]
    [ "$(_res "$TEST_DIR/out" "list(d['steps'])")" = "['modes', 'selection', 'preloads', 'gitFiles', 'recordsCutover', 'stamp']" ]
    [ "$(_res "$TEST_DIR/out" "set(d['steps'].values())")" = "{'ok'}" ]
    # gitFiles: every line of the two templates is in the fixture's files, and the specific ones are named.
    local tpl="$SCRIPT_DIR/../templates" l
    while IFS= read -r l; do
        [[ -z "$l" || "$l" == \#* ]] && continue
        grep -qxF -- "$l" "$TARGET/.gitignore" || { echo "missing from .gitignore: $l"; return 1; }
    done < "$tpl/gitignore-framework.txt"
    while IFS= read -r l; do
        [[ -z "$l" || "$l" == \#* ]] && continue
        grep -qxF -- "$l" "$TARGET/.gitattributes" || { echo "missing from .gitattributes: $l"; return 1; }
    done < "$tpl/gitattributes-additions.txt"
    grep -qxF '.trd-state/current.json' "$TARGET/.gitignore"
    grep -qxF '.trd-state/*' "$TARGET/.gitignore"
    grep -qxF '!.trd-state/_docs-audit/' "$TARGET/.gitignore"
    grep -qxF '.trd-state/_session-log.md merge=union' "$TARGET/.gitattributes"
    grep -qxF '.trd-state/_sweep/discovered.jsonl merge=union' "$TARGET/.gitattributes"
    # recordsCutover: no origin, so nothing pushed; the in-flight feature is seeded, the closed one is not,
    # tracked records are untracked from the index (files stay), and nothing was committed.
    git -C "$TARGET" show refs/ensemble/records/live:implement.json | cmp - "$TARGET/.trd-state/live/implement.json"
    [ -z "$(git -C "$TARGET" for-each-ref refs/ensemble/records/done)" ]
    [ -z "$(git -C "$TARGET" ls-files .trd-state)" ]
    [ -f "$TARGET/.trd-state/live/implement.json" ] && [ -f "$TARGET/.trd-state/done/closed.json" ]
    [ "$(git -C "$TARGET" log --oneline | wc -l | tr -d ' ')" -eq 1 ]
    while IFS= read -r h; do
        [[ -f "$c/hooks/$h" ]] && [ -x "$c/hooks/$h" ] || { echo "not executable: $h"; return 1; }
    done < <(_manifest_hooks)
    [ -s "$c/selected-skills.txt" ]
    grep -qx jest "$c/selected-skills.txt"
    run grep -qx pytest "$c/selected-skills.txt"
    [ "$status" -ne 0 ]
    [ ! -e "$c/skills/pytest" ]
    # An agent with an affinity pool has its preload back; the owner-edited one is untouched.
    grep -q "ENSEMBLE:SKILLS:BEGIN" "$c/agents/backend-implementer.md"
    cmp "$c/agents/code-reviewer.md" "$TEST_DIR/cr.before"
    [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ensemble"]["previous_version"])' "$c/settings.json")" = "4.15.0" ]
    [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ensemble"]["version"])' "$c/settings.json")" = \
      "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PLUGIN/.claude-plugin/plugin.json")" ]
    [ "$(_res "$TEST_DIR/out" "d['categories']['commands']['added']")" = "['commands/amend.md']" ]

    # Second apply: nothing to add, replace or remove; only the two timestamps move.
    _modes "$TARGET" > "$TEST_DIR/modes.before"
    _tree_hashes "$TARGET" | grep -v 'settings.json' > "$TEST_DIR/tree.before"
    _settings_sans_stamp "$TARGET" > "$TEST_DIR/settings.before"
    "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/out2" 2>/dev/null
    [ "$(_res "$TEST_DIR/out2" "[(c, k) for c, v in d['categories'].items() for k in ('added','replaced','removed') if v[k]]")" = "[]" ]
    [ "$(_res "$TEST_DIR/out2" "set(d['steps'].values())")" = "{'ok'}" ]
    [ "$(_modes "$TARGET")" = "$(cat "$TEST_DIR/modes.before")" ]
    [ "$(_tree_hashes "$TARGET" | grep -v 'settings.json')" = "$(cat "$TEST_DIR/tree.before")" ]
    [ "$(_settings_sans_stamp "$TARGET")" = "$(cat "$TEST_DIR/settings.before")" ]
}

@test "post steps: dry-run reports every step not run; a settings.json that is not JSON fails only the stamp" {
    _make_target
    ( cd "$TARGET" && git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -q -m fixture )
    "$SCAFFOLD" --rebase --dry-run --plugin-dir "$PLUGIN" "$TARGET" >"$TEST_DIR/out" 2>/dev/null
    [ "$(_res "$TEST_DIR/out" "set(d['steps'].values())")" = "{'not run'}" ]
    printf 'not json' > "$TARGET/.claude/settings.json"
    run "$SCAFFOLD" --rebase --plugin-dir "$PLUGIN" "$TARGET"
    printf '%s\n' "${lines[@]}" | tail -n 1 > "$TEST_DIR/last"
    [ "$(_res "$TEST_DIR/last" "d['steps']['stamp'].startswith('failed')")" = "True" ]
    [ "$(_res "$TEST_DIR/last" "d['steps']['modes']")" = "ok" ]
    [ "$(_res "$TEST_DIR/last" "d['steps']['recordsCutover']")" = "ok" ]
}

# --- the whole engine on one aged fixture (RBE-T001) -------------------------

# Every file under $1 (not .git) as "<path> <hash> <mode>"; settings.json is hashed with the two
# stamp timestamps removed (O14).
_state() {
    python3 - "$1" <<'PY'
import hashlib, json, os, stat, sys
root = sys.argv[1]
rows = []
for base, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d != ".git"]
    for f in files:
        p = os.path.join(base, f)
        rel = os.path.relpath(p, root)
        data = open(p, "rb").read()
        if rel == ".claude/settings.json":
            d = json.loads(data)
            for k in ("refreshed_at", "rebased_at"):
                d.get("ensemble", {}).pop(k, None)
            data = json.dumps(d, sort_keys=True).encode()
        rows.append("%s %s %s" % (rel, hashlib.sha1(data).hexdigest(), oct(stat.S_IMODE(os.lstat(p).st_mode))))
print("\n".join(sorted(rows)))
PY
}

# Run the engine on $1 and keep stdout apart from stderr (D16); sets RESULT to the last stdout line.
_run_rebase() {
    run --separate-stderr "$SCAFFOLD" --rebase "${@:2}" --plugin-dir "$PLUGIN" "$1"
    [ "$status" -eq 0 ]
    RESULT="${lines[-1]}"
    printf '%s\n' "$RESULT" > "$TEST_DIR/result"
}

@test "aged fixture: apply lists every case, dry-run on a copy matches it, a second apply is a no-op, refresh keeps the retired file" {
    _aged_target
    local c="$TARGET/.claude"
    # A user hook registration the merge must carry.
    _edit "d['hooks']['PostToolUse'].append({'matcher': 'Bash', 'hooks': [{'type': 'command', 'command': 'my-linter --check'}]})"
    ( cd "$TARGET" && git add -A && git -c user.email=a@b -c user.name=t commit -q -m aged )
    local rule
    for rule in $(bash -c 'set --; source "$1"; authored_rules' _ "$SCAFFOLD"); do
        [ -f "$c/rules/$rule" ] && cp "$c/rules/$rule" "$TEST_DIR/rule.$rule"
    done
    cp -R "$TARGET" "$TEST_DIR/copy"
    cp -R "$TARGET" "$TEST_DIR/refreshcopy"
    _state "$TEST_DIR/copy" > "$TEST_DIR/copy.before"

    # Dry-run on the copy first: nothing changes there.
    _run_rebase "$TEST_DIR/copy" --dry-run
    cp "$TEST_DIR/result" "$TEST_DIR/dry.out"
    [ -z "$(cd "$TEST_DIR/copy" && git status --porcelain)" ]
    [ "$(_state "$TEST_DIR/copy")" = "$(cat "$TEST_DIR/copy.before")" ]

    # The apply.
    _run_rebase "$TARGET"
    cp "$TEST_DIR/result" "$TEST_DIR/apply.out"
    [ "$(_res "$TEST_DIR/apply.out" "d['categories']['commands']['added']")" = "['commands/amend.md']" ]
    [ "$(_res "$TEST_DIR/apply.out" "d['categories']['commands']['replaced']")" = "['commands/plan.md']" ]
    [ "$(_res "$TEST_DIR/apply.out" "d['categories']['commands']['removed']")" = "['commands/fix-issue.md']" ]
    [ "$(_res "$TEST_DIR/apply.out" "d['categories']['hooks']['removed']")" = "['hooks/permitter/']" ]
    [ "$(_res "$TEST_DIR/apply.out" "d['categories']['agents']['preserved']")" = "['agents/my-agent.md']" ]
    [ "$(_res "$TEST_DIR/apply.out" "d['categories']['skills']['preserved']")" = "['skills/my-skill']" ]
    [ "$(_res "$TEST_DIR/apply.out" "sorted(x['path'] for x in d['categories']['agents']['conflicts'])")" = "['agents/code-reviewer.md']" ]
    [ "$(_regs | grep -c '^PostToolUse my-linter --check$')" -eq 1 ]
    for rule in $(bash -c 'set --; source "$1"; authored_rules' _ "$SCAFFOLD"); do
        [ ! -f "$TEST_DIR/rule.$rule" ] || cmp "$c/rules/$rule" "$TEST_DIR/rule.$rule"
    done
    grep -q DISTINCTIVE-VERIFICATION "$c/rules/verification.md"

    # The dry-run listed what the apply did.
    diff <(_res "$TEST_DIR/dry.out" "__import__('json').dumps(d['categories'], sort_keys=True)") \
         <(_res "$TEST_DIR/apply.out" "__import__('json').dumps(d['categories'], sort_keys=True)")
    [ "$(_res "$TEST_DIR/dry.out" "d['mode']")" = "dry-run" ]

    # A second apply adds, replaces and removes nothing; the owner edit is still a conflict, bytes intact.
    local owner_bytes
    owner_bytes="$(shasum "$c/agents/code-reviewer.md")"
    _state "$TARGET" > "$TEST_DIR/state.before"
    _run_rebase "$TARGET"
    cp "$TEST_DIR/result" "$TEST_DIR/apply2.out"
    [ "$(_res "$TEST_DIR/apply2.out" "[(k, i) for k, v in d['categories'].items() for i in ('added','replaced','removed') if v[i]]")" = "[]" ]
    [ "$(_res "$TEST_DIR/apply2.out" "sorted(x['path'] for x in d['categories']['agents']['conflicts'])")" = "['agents/code-reviewer.md']" ]
    [ "$(shasum "$c/agents/code-reviewer.md")" = "$owner_bytes" ]
    [ "$(_state "$TARGET")" = "$(cat "$TEST_DIR/state.before")" ]

    # --refresh does not remove a retired file (OQ-2).
    "$SCAFFOLD" --refresh --plugin-dir "$PLUGIN" "$TEST_DIR/refreshcopy" >/dev/null 2>&1
    [ -f "$TEST_DIR/refreshcopy/.claude/commands/fix-issue.md" ]
}
