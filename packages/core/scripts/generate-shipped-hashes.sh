#!/usr/bin/env bash
#
# generate-shipped-hashes.sh - build and check packages/core/templates/shipped-hashes.json
# (docs/TRD/deterministic-rebase-engine.md, D8).
#
# The file lists, per installed path, the hash of every version any `v*` release
# installed, so `scaffold-project.sh --rebase` can tell "an older shipped version"
# (replace) from "an owner edit" (conflict). Each tag is rendered with THAT tag's own
# scaffold, so renames, symlinked sources and layout moves are resolved by construction.
#
# Usage:
#   generate-shipped-hashes.sh --seed                 render every v* tag merged into HEAD, write the list
#   generate-shipped-hashes.sh --append <tag>         render one more tag and add its hashes (never removes)
#   generate-shipped-hashes.sh --check                exit 1, naming what is wrong, if the list is bad
#   Test overrides: --repo DIR (git repository holding the tags), --list FILE (the list)
#
# Release step: run `--append <previous tag>` (the newest v* tag older than HEAD) so the
# list gains the release just before the one being cut. `--check` runs the structural and
# retired-coverage parts anywhere; the history part only on a full clone with v* tags.
#
# Hashes are git blob ids (`git hash-object`), so a false conflict can be traced with
# `git log --find-object=<id>`. Agents use the `normhash` of scaffold-project.sh (generated
# preload content stripped), never a second strip implementation.

set -euo pipefail

GEN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$GEN_DIR/../../.." && pwd)"
TEMPLATES_DIR="$GEN_DIR/../templates"

usage() {
    echo "Usage: generate-shipped-hashes.sh (--seed | --append <tag> | --check) [--repo DIR] [--list FILE]" >&2
}

MODE=""
TAG=""
REPO="$REPO_ROOT"
LIST="$TEMPLATES_DIR/shipped-hashes.json"
RETIRED="$TEMPLATES_DIR/retired-files.json"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --seed|--check)
            [[ -z "$MODE" ]] || { usage; exit 1; }
            MODE="${1#--}"; shift ;;
        --append)
            [[ -z "$MODE" ]] || { usage; exit 1; }
            [[ $# -ge 2 && -n "$2" ]] || { echo "ERROR: --append needs a tag" >&2; usage; exit 1; }
            MODE="append"; TAG="$2"; shift 2 ;;
        --repo)
            [[ $# -ge 2 ]] || { usage; exit 1; }
            REPO="$2"; shift 2 ;;
        --list)
            [[ $# -ge 2 ]] || { usage; exit 1; }
            LIST="$2"; shift 2 ;;
        *)
            echo "ERROR: unknown argument: $1" >&2
            usage; exit 1 ;;
    esac
done
[[ -n "$MODE" ]] || { usage; exit 1; }

TAG_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+$'

# The current script supplies render_plugin_tree, authored_rules and agent_normhash.
# `set --` first: the sourced file parses the positional parameters as its own flags.
load_scaffold() {
    set --
    # shellcheck source=packages/core/scripts/scaffold-project.sh
    source "$GEN_DIR/scaffold-project.sh"
    PLUGIN_DIR="$REPO_ROOT/packages/full"
}

# One program, several modes, as scaffold-project.sh does for its Python parts.
#   collect <render-dir> <normhash-file> <authored-rule>...   print {"files":{path:hash},"prompts":[hash]}
#   build   <out> <existing|-> <collect.json>...              merge into the list; <tag>=<json> pairs
#   check   <list> <retired>                                  structural checks, then
#   cover   <list> <retired> <collect.json>                   retired coverage
#   newest  <list>                                            print the newest listed tag
#   merged  <tag>...                                          print tags in version order
shipped_program() {
    cat <<'PY'
import hashlib, json, os, re, sys

TAG = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
HEX = re.compile(r"^[0-9a-f]{40}$")
KNOWN = ("commands", "agents", "skills", "hooks", "hooks/lib", "hooks/prompts",
         "workflows", "lib", "contracts", "rules")

def blob(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

def vkey(tag):
    return tuple(int(n) for n in tag[1:].split("."))

def category(rel):
    parts = rel.split("/")
    if parts[0] in ("commands", "agents", "skills", "workflows", "lib", "contracts", "rules"):
        return parts[0]
    if parts[0] == "hooks":
        if len(parts) == 2:
            return "hooks"
        if len(parts) > 2 and parts[1] in ("lib", "prompts"):
            return "hooks/" + parts[1]
    return None  # settings.json, selected-skills.txt, other hook subdirectories

def collect(render, normhash_file, authored):
    claude = os.path.join(render, ".claude")
    agents = {}
    with open(normhash_file) as fh:
        for line in fh:
            name, _, h = line.rstrip("\n").partition("\t")
            if name:
                agents[name] = h
    files = {}
    for root, _dirs, names in os.walk(claude):
        for name in names:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, claude).replace(os.sep, "/")
            cat = category(rel)
            if cat is None or os.path.islink(full):
                continue
            if cat == "rules" and rel[len("rules/"):] in authored:
                continue
            if cat == "agents" and rel.endswith(".md") and rel.count("/") == 1:
                files[rel] = agents[rel[len("agents/"):-3]]
            else:
                with open(full, "rb") as fh:
                    files[rel] = blob(fh.read())
    prompts = set()
    settings = os.path.join(claude, "settings.json")
    if os.path.isfile(settings):
        with open(settings, encoding="utf-8") as fh:
            hooks = json.load(fh).get("hooks") or {}
        for groups in hooks.values():
            for group in groups:
                for h in group.get("hooks", []):
                    if h.get("type") == "prompt" and isinstance(h.get("prompt"), str):
                        prompts.add(blob(h["prompt"].encode("utf-8")))
    return {"files": files, "prompts": sorted(prompts)}

def dump(obj):
    return json.dumps(obj, indent=2, sort_keys=True) + "\n"

mode = sys.argv[1]

if mode == "collect":
    print(dump(collect(sys.argv[2], sys.argv[3], set(sys.argv[4:]))), end="")

elif mode == "build":
    out, existing = sys.argv[2], sys.argv[3]
    data = {"version": 1, "hash": "git-blob-sha1", "tags": [], "files": {}, "promptHooks": []}
    if existing != "-" and os.path.isfile(existing):
        with open(existing) as fh:
            data = json.load(fh)
    files = {p: set(h) for p, h in data["files"].items()}
    prompts = set(data["promptHooks"])
    tags = set(data["tags"])
    for pair in sys.argv[4:]:
        tag, _, path = pair.partition("=")
        with open(path) as fh:
            got = json.load(fh)
        tags.add(tag)
        prompts.update(got["prompts"])
        for p, h in got["files"].items():
            files.setdefault(p, set()).add(h)
    data["tags"] = sorted(tags, key=vkey)
    data["files"] = {p: sorted(h) for p, h in sorted(files.items())}
    data["promptHooks"] = sorted(prompts)
    text = dump(data)
    if os.path.isfile(out):
        with open(out) as fh:
            if fh.read() == text:
                sys.exit(0)  # byte-identical: leave the file alone
    tmp = out + ".tmp"
    with open(tmp, "w") as fh:
        fh.write(text)
    os.replace(tmp, out)

elif mode == "check":
    bad = []
    try:
        with open(sys.argv[2]) as fh:
            data = json.load(fh)
    except (OSError, ValueError) as e:
        print("shipped-hashes: not readable JSON: %s" % e)
        sys.exit(1)
    if not isinstance(data, dict):
        print("shipped-hashes: top level is not an object"); sys.exit(1)
    if data.get("version") != 1: bad.append("version is not 1")
    if data.get("hash") != "git-blob-sha1": bad.append('hash is not "git-blob-sha1"')
    tags = data.get("tags")
    if not isinstance(tags, list) or not tags or not all(isinstance(t, str) and TAG.match(t) for t in tags):
        bad.append("tags must be a non-empty list of vN.N.N names")
    elif tags != sorted(set(tags), key=vkey):
        bad.append("tags are not sorted in version order and unique")

    def hashes(label, lst):
        if not isinstance(lst, list) or not lst:
            bad.append("%s: not a non-empty list" % label)
        elif not all(isinstance(h, str) and HEX.match(h) for h in lst):
            bad.append("%s: a hash that is not 40 lowercase hex" % label)
        elif lst != sorted(set(lst)):
            bad.append("%s: hashes not sorted and unique" % label)

    files = data.get("files")
    if not isinstance(files, dict):
        bad.append("files is not an object"); files = {}
    if list(files) != sorted(files):
        bad.append("files keys are not sorted")
    for path, lst in files.items():
        if path.startswith("/") or ".." in path.split("/") or category(path) is None:
            bad.append("%s: not a relative path inside a category directory" % path)
        hashes(path, lst)
    hashes("promptHooks", data.get("promptHooks"))
    retired = json.load(open(sys.argv[3]))["entries"]
    if bad:
        for b in bad: print("shipped-hashes: " + b)
        sys.exit(1)

elif mode == "cover":
    with open(sys.argv[2]) as fh:
        files = json.load(fh)["files"]
    retired = [e["path"] for e in json.load(open(sys.argv[3]))["entries"]]
    with open(sys.argv[4]) as fh:
        current = json.load(fh)["files"]
    missing = []
    for path in files:
        if path in current:
            continue
        if any(path == r or (r.endswith("/") and path.startswith(r)) for r in retired):
            continue
        missing.append(path)
    for p in missing:
        print("shipped-hashes: %s is listed, but no current render ships it and no retired-files entry covers it" % p)
    sys.exit(1 if missing else 0)

elif mode == "newest":
    tags = json.load(open(sys.argv[2]))["tags"]
    print(max(tags, key=vkey))

elif mode == "sort":
    for t in sorted(sys.argv[2:], key=vkey):
        print(t)
PY
}

run_py() { python3 -c "$(shipped_program)" "$@"; }

# Render <tag> with that tag's own scaffold into a temp directory and write the
# collected hashes to <out-json>. Returns non-zero (with the scaffold's output on
# stderr) when the tag will not render: a tag that cannot be rendered is reported,
# never skipped, since its installs would then read as conflicts with no trace.
collect_tag() {
    local tag="$1" out="$2" work lib rc=0
    git -C "$REPO" rev-parse -q --verify "refs/tags/$tag" >/dev/null \
        || { echo "ERROR: tag $tag does not exist in $REPO" >&2; return 1; }
    work="$(mktemp -d)"
    work="$(cd "$work" && pwd -P)"
    mkdir -p "$work/x" "$work/r/.claude"
    # git archive keeps the packages/full -> ../core symlinks and writes nothing in .git.
    if ! git -C "$REPO" archive "$tag" | tar -x -C "$work/x"; then
        echo "ERROR: could not export $tag" >&2; rm -rf "$work"; return 1
    fi
    lib="$work/x/packages/full/skills-lib"
    [[ -d "$lib" ]] || lib="$work/x/packages/full/skills"
    if [[ -d "$lib" ]]; then
        find -L "$lib" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort \
            > "$work/r/.claude/selected-skills.txt"
    else
        : > "$work/r/.claude/selected-skills.txt"
    fi
    # Absolute --plugin-dir; the ceiling keeps the scaffold's git steps out of any repository above.
    if ! GIT_CEILING_DIRECTORIES="$work" bash "$work/x/packages/core/scripts/scaffold-project.sh" \
            --plugin-dir "$work/x/packages/full" --copy-skills "$work/r" >/dev/null 2>"$work/err"; then
        echo "ERROR: $tag's own scaffold failed:" >&2
        tail -n 5 "$work/err" >&2
        rm -rf "$work"; return 1
    fi
    agent_normhash "$work/r/.claude/agents" > "$work/normhash"
    # shellcheck disable=SC2046
    run_py collect "$work/r" "$work/normhash" $(authored_rules) > "$out" || rc=1
    rm -rf "$work"
    return "$rc"
}

# Print the v* tags merged into HEAD, excluding any tag on HEAD itself, in version order.
merged_tags() {
    local head t
    head="$(git -C "$REPO" rev-parse HEAD)"
    local -a tags=()
    while IFS= read -r t; do
        [[ "$t" =~ $TAG_PATTERN ]] || continue
        [[ "$(git -C "$REPO" rev-parse "$t^{commit}")" == "$head" ]] && continue
        tags+=("$t")
    done < <(git -C "$REPO" tag --merged HEAD --list 'v*')
    [[ ${#tags[@]} -gt 0 ]] || return 0
    run_py sort "${tags[@]}"
}

do_seed() {
    load_scaffold
    local t
    SCRATCH="$(mktemp -d)"
    trap 'rm -rf "$SCRATCH"' EXIT
    local -a pairs=()
    while IFS= read -r t; do
        [[ -n "$t" ]] || continue
        echo "rendering $t" >&2
        collect_tag "$t" "$SCRATCH/$t.json" || return 1   # stop on the first tag that fails
        pairs+=("$t=$SCRATCH/$t.json")
    done < <(merged_tags)
    [[ ${#pairs[@]} -gt 0 ]] || { echo "ERROR: no v* tags merged into HEAD" >&2; return 1; }
    run_py build "$LIST" - "${pairs[@]}"
    echo "seeded $LIST with ${#pairs[@]} tags" >&2
}

do_append() {
    load_scaffold
    [[ "$TAG" =~ $TAG_PATTERN ]] || { echo "ERROR: not a vN.N.N tag: $TAG" >&2; return 1; }
    SCRATCH="$(mktemp -d)"
    trap 'rm -rf "$SCRATCH"' EXIT
    collect_tag "$TAG" "$SCRATCH/t.json" || return 1
    run_py build "$LIST" "$LIST" "$TAG=$SCRATCH/t.json"
    echo "appended $TAG to $LIST" >&2
}

do_check() {
    local rc=0 fake lib d out newest t
    [[ -f "$LIST" ]] || { echo "ERROR: $LIST not found" >&2; return 1; }
    run_py check "$LIST" "$RETIRED" || return 1
    echo "structure: ok"

    # Retired coverage: a render of the current plugin with every library skill selected.
    load_scaffold
    SCRATCH="$(mktemp -d)"
    trap 'rm -rf "$SCRATCH"' EXIT
    fake="$SCRATCH/target"
    lib="$PLUGIN_DIR/skills-lib"
    [[ -d "$lib" ]] || lib="$PLUGIN_DIR/skills"
    mkdir -p "$fake/.claude/skills"
    for d in "$lib"/*/; do
        [[ -d "$d" ]] && mkdir -p "$fake/.claude/skills/$(basename "$d")"
    done
    mkdir -p "$SCRATCH/render"
    render_plugin_tree "$fake" "$SCRATCH/render" >/dev/null 2>"$SCRATCH/render.err" \
        || { echo "ERROR: could not render the current plugin" >&2; cat "$SCRATCH/render.err" >&2; return 1; }
    agent_normhash "$SCRATCH/render/.claude/agents" > "$SCRATCH/normhash"
    # shellcheck disable=SC2046
    run_py collect "$SCRATCH/render" "$SCRATCH/normhash" $(authored_rules) > "$SCRATCH/current.json"
    run_py cover "$LIST" "$RETIRED" "$SCRATCH/current.json" || rc=1
    [[ $rc -eq 0 ]] && echo "coverage: ok"

    # History: the newest listed tag must be the newest v* tag merged into HEAD.
    if ! git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
        echo "history: skipped (not a git repository)"
    elif [[ "$(git -C "$REPO" rev-parse --is-shallow-repository)" == "true" ]]; then
        echo "history: skipped (shallow clone)"
    else
        out="$(merged_tags)"
        if [[ -z "$out" ]]; then
            echo "history: skipped (no v* tags)"
        else
            newest="$(printf '%s\n' "$out" | tail -n 1)"
            t="$(run_py newest "$LIST")"
            if [[ "$newest" == "$t" ]]; then
                echo "history: checked"
            else
                echo "shipped-hashes: newest v* tag merged into HEAD is $newest, but the list's newest is $t; run: generate-shipped-hashes.sh --append $newest"
                echo "history: checked"
                rc=1
            fi
        fi
    fi
    return "$rc"
}

case "$MODE" in
    seed)   do_seed ;;
    append) do_append ;;
    check)  do_check ;;
esac
